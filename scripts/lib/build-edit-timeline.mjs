/**
 * Single source of truth for B-roll edit timelines (loop + ffmpeg assembly).
 * Always use post-TTS segment.duration when building for render.
 * When project.visualBeatSheet is present, prefer assets that match the
 * active beat for each time window (narration-aligned semantic placement).
 */
import {
  scoreAssetRelevance,
  isOffBrandVisual,
  isGenericStockJunk,
  hasHealthcareEvidence,
} from './harvest-quality.mjs';
import { isAirlineTopic, isHealthcareTopic, isHousingTopic, isWorkplaceTopic } from './topic-family.mjs';
import { isEvalColdMode } from './eval-flags.mjs';
import { stillQualityTimelinePenalty } from './sanitize-media-quality.mjs';

/**
 * @param {object} project
 * @param {{ cutIntervalSec?: number, reason?: string }} [options]
 * @returns {Array<{ segmentId: string, startSec: number, endSec: number, assetId: string, reason: string }>}
 */
function urlKey(asset) {
  return (asset?.url || '').split('?')[0] || asset?.id || '';
}

function assetBlob(asset) {
  return `${asset?.query || ''} ${asset?.title || ''} ${asset?.alt || ''} ${asset?.source || ''} ${asset?.url || ''}`.toLowerCase();
}

/** Title/alt/url only — harvest `query` is aspirational and must not spoof faces. */
function assetEvidenceBlob(asset) {
  return `${asset?.title || ''} ${asset?.alt || ''} ${asset?.source || ''} ${asset?.url || ''}`.toLowerCase();
}

/** Archive war/naval/bay establishing that must never open a housing hook. */
const HOUSING_WAR_NAVAL_ESTABLISHING_RE =
  /\b(vietnam|war\s+home\s+movie|subic\s+bay|home\s+movie|naval|re[\s-]?supply|war\s+footage|airstrike|air\s*strike|gaza(?:\s+strip)?)\b/;

function uniqueAssetsByUrl(assets) {
  const seen = new Set();
  const out = [];
  for (const asset of assets) {
    const key = urlKey(asset);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(asset);
  }
  return out;
}

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

const AIRLINE_LIMITED_CLUSTERS = new Set(['paperwork', 'mail', 'document', 'financial']);

/** Subjects that must never carry a story, whatever the reuse pressure. */
const NEVER_USE_SUBJECT_RE = /\b(puppet|beetle|insect|bug macro|macro bug|spider macro|larva|caterpillar|cartoon|animation still|minecraft)\b/;

function isNeverUseVisual(asset) {
  return NEVER_USE_SUBJECT_RE.test(assetBlob(asset));
}

/**
 * Archive / simulator / generic stock-footage clips. Thin keyless pools lean on
 * these (e.g. one flight-sim clip harvested four times), so a repeat of one of
 * them reads as a hard loop even when its topical score is high — demote extra.
 */
const ARCHIVE_SIM_STOCK_RE = /\b(archive\.org|archive|flight ?sim|sim(?:ulator|ulation)|stock footage|getty|pond5|videvo|coverr)\b/;

function isArchiveOrSimStock(asset) {
  return ARCHIVE_SIM_STOCK_RE.test(assetBlob(asset));
}

/**
 * Car-crash / generic stock loops. On housing-market stories these read as the
 * wrong crash; anywhere, repeating one crash URL tanks visualVariety.
 */
const CRASH_OR_STOCK_LOOP_RE =
  /\b(car crash|dash ?cam(?: footage)?|wreck|pile.?up|highway accident|auto accident|stock (?:photo|footage)|getty|pond5)\b|housing\s*market\s*crash\.jpg|will-the-housing-market-crash|neohomeloans|house\s+on\s+(?:a\s+)?rock|floating\s+(?:rock|island)|3d\s+house/i;

function isCrashOrStockLoopVisual(asset) {
  return CRASH_OR_STOCK_LOOP_RE.test(assetBlob(asset));
}

const CAMERA_STORY_RE = /\b(cctv|surveillance|security camera|security cameras|cameras?|footage|body ?cam|dash ?cam)\b/i;

function isSurveillanceVisual(asset) {
  return /\b(cctv|surveillance|security camera|security cameras|camera footage|monitor wall|control room|monitoring station)\b/.test(
    assetBlob(asset),
  );
}

/** Coarse visual cluster so cold body cuts don't loop the same subject. */
export function visualSubjectCluster(asset) {
  const blob = assetBlob(asset);
  if (/\b(u\.?s\.?\s*mail|usps|postal|post\s*box|mailbox|mail\s*box|letterbox|envelopes?|mailroom|mail\s+truck)\b/.test(blob)) {
    return 'mail';
  }
  if (/\b(financial|finance|bank\s*statement|credit\s*card|invoice|receipt|tax\s*form|money|dollars?|stock\s*market|spreadsheet|budget|accounting|ledger|loan)\b/.test(blob)) {
    return 'financial';
  }
  if (/\b(paperwork|forms?|paper\s*stack|stack\s*of\s*papers|clipboard|file\s*folder|filing\s*cabinet)\b/.test(blob)) {
    return 'paperwork';
  }
  if (/\b(documents?|records?|contract|passport|boarding\s*pass|ticket\s*counter|case\s*file)\b/.test(blob)) {
    return 'document';
  }
  if (/ambulance|paramedic|emt|911|dispatch/.test(blob)) return 'ambulance';
  if (/aerial|drone|overhead|bird.?eye|skyline|from above/.test(blob)) return 'aerial';
  if (/coding|source.?code|laptop screen|computer screen|typing keyboard|ide /.test(blob)) return 'coding';
  if (
    /masked|face mask|surgical mask|respirator/.test(blob)
    && /couple|people|person|passenger|patient|family/.test(blob)
  ) {
    return 'masked-human';
  }
  if (/back of head|from behind|rear view|backs? to camera|looking through (a )?window|looking out (the )?window|staring out (the )?window/.test(blob)) {
    return 'back-view-human';
  }
  if (/cockpit|flight deck/.test(blob)) return 'cockpit';
  if (/airplane window|plane window|cabin window|window seat/.test(blob)) return 'window-view';
  if (/cabin|airplane interior|aircraft interior|passenger seats|aisle|flight attendant/.test(blob)) return 'cabin-interior';
  if (/runway|tarmac|airport|airplane|aircraft|jet |plane in (the )?sky/.test(blob)) return 'aircraft';
  if (/flood|zoning|map /.test(blob)) return 'mapdocs';
  if (/lab|pipette|sensor|calibrat|test tube/.test(blob)) return 'lab';
  if (/ship|port|container|cargo|dock|crane/.test(blob)) return 'port';
  if (/face|person|people|couple|worried|shocked|portrait|close.?up|crew|pilot|driver/.test(blob)) {
    return 'human';
  }
  if (/office|conference|corporate|meeting room/.test(blob)) return 'office';
  return 'other';
}

function isHumanCluster(cluster) {
  return cluster === 'human';
}

function isBackViewDeadAir(asset) {
  const blob = assetBlob(asset);
  return /\b(back of head|from behind|rear view|backs? to camera|looking through (a )?window|looking out (the )?window|staring out (the )?window)\b/.test(blob);
}

/**
 * Passive desk-and-paper stock (paperwork piles, hands shuffling forms,
 * anonymous typing) reads as dead air in the hook. Only frames without a
 * readable face count as passive — a worried tenant holding an eviction
 * notice is a story beat, a stack of forms is not.
 * Also catches eviction/housing notices and payment checks without a face
 * (housing-web31: "THE HOUSING CRASH THEY HID" over static document).
 */
const PASSIVE_DESK_INTRO_RE = /\b(paperwork|documents?|forms?|folders?|clipboard|invoices?|receipts?|bank statements?|tax forms?|ledgers?|spreadsheets?|stacks? of papers?|paper stacks?|shuffling papers?|signing papers?|hands? (?:on|at|over) (?:a |the )?desk|hands? typing|typing on (?:a |the )?keyboard|writing at (?:a |the )?desk|desk close.?up|eviction\s+notice|notices?\s+to\s+(?:vacate|quit|pay)|cashier'?s?\s+checks?|payment\s+checks?|check\s+stubs?|rent\s+checks?|housing\s+checks?|static\s+document|document\s+only|check\s+(?:only|document|form|closeup|close.?up))\b/;

export function isPassiveDeskIntroVisual(asset) {
  return PASSIVE_DESK_INTRO_RE.test(assetBlob(asset)) && !hasReadableFaceVisual(asset);
}

function isRejectedIntroLeadVisual(asset, { airline = false, housing = false, healthcare = false } = {}) {
  const blob = assetBlob(asset);
  if (/\b(runway|tarmac|fence|sky|clouds?|aerial|from above|distant plane|distant aircraft|plane in (the )?sky|aircraft in (the )?sky|back of head|from behind|rear view|looking through (a )?window|looking out (the )?window|airplane window|plane window|cabin window)\b/.test(blob)) {
    return true;
  }
  // Housing hooks must not open on lake/mountain/Archive landscape stock.
  if (housing && isLandscapeOnlyIntroVisual(asset)) return true;
  // Webinar / sitting-in-chair openers read as low-energy (web17 raw 4.6).
  if (housing && isHousingTalkingHeadMotion(asset)) return true;
  if (
    housing
    && /\b(sitting\s+in\s+(?:a\s+)?chair|office\s+chair|home\s+tour|zoom\s+call|talking\s+to\s+camera\s+desk|(?:gaming\s+)?headset|podcast\s+mic(?:rophone)?|youtubers?|youtube\s+flag|like\s+and\s+subscribe|subscribe\s+button|streamer\s+(?:setup|headset|mic))\b/i.test(blob)
  ) {
    return true;
  }
  // Housing-web31: static document / housing price index chart openers.
  // The generic isPassiveDeskIntroVisual gate below (all-topics) already hard-rejects
  // eviction notices/checks without a face; explicit static-document tokens here
  // catch non-standard metadata that slips through the passive-desk keyword list.
  if (
    housing
    && /\b(rolfe\s+report|periscope\s*film|bird'?s?\s+nests?|leapfrog|letter\s+factory|miss\s+brooks|propaganda\s+film|ticking\s+time\s+bombs?|dynamite|progress\s+center|fair\s+housing\s+conference|county\s+announces|administrative\s+officer|self\s+sufficiency|for\s+sale\s+sign|re\/?max|realtor\s+sign|real\s+estate\s+sign|yard\s+sign|one57|million\s+apartment|negative\s+space|ron\s+koertge|michael\s+jackson|michael\s+bolton|end\s+the\s+fed|mousetrap|american\s+home\s+mortgage|mortgage\s+bankruptcy|bankruptcy\s+(?:slide|filing|graphic)|crater\s+graphic|golden\s+valley\s+approves|landlord\s+tenant\s+act|lawyers?\s+committee|tenant\s+advocacy|square[\s-]?foot|sustainable\s+high\s+rise|may\s+day\s+caravan|livestream\s+archive|business\s+insider|fire\s+destroys\s+apartment|alarm\s+fire|protest(?:ers?|ing)?|picket|rent\s+strike|rent\s+increase|social\s+justice\s+tribunal|tribunals?\s+ontario|parkdale\s+vs|cbs\s*6|problem\s+solvers?|odsp|bill\s*60|soviet|hammer\s+and\s+sickle|moldova|redfin\s+predictions?|zillow\s+economist|gaming\s+chair|bathroom\s+bucket|dirty\s+bathroom|crash\s+is\s+here|yellow\s+turban|cummins|diesel\s+engine|zillow\s+chart|overthinking\s+quotes?|bronxnet|volkswagen|tampa\s+police|marco\s+rubio|katherine\s+jenkins|mormon\s+tabernacle|sarah\s+jenkins|redfin\s+(?:bar\s+)?chart|bar\s+chart|home\s+value\s+index|housing\s+price\s+index|housing\s+price\s+chart|static\s+document|housing\s+(?:crash\s+)?document|mortgage\s+document)\b/i.test(blob)
  ) {
    return true;
  }
  // Healthcare AI hooks must not open on course title cards / Giphy / protest /
  // maternity / ritual / news talking-head studio pads (healthcare-web3).
  // Also reject exhibition-hall / trade-show / conference-booth intros that look
  // clinical but show a product demo floor, not OR/hospital use (web11 suit opener).
  // healthcare-web18: blurry test-tube / petri-dish openers.
  // healthcare-web20: standalone trade-show / corporate-presentation openers.
  if (
    healthcare
    && (
      /giphy\.com|media\d*\.giphy\.com/i.test(blob)
      || /\b(coursera|stanford\s+online|course\s+trailer|lecture\s+slides?|title\s+card|capitol|protest(?:ers?|ing)?|political\s+rally|maternity|childbirth|kapparot|kapores|news\s+talking\s*heads?|talking\s*heads?\s+(?:studio|news|interview)|news\s+(?:anchor|studio|desk)|webinar|keynote|ted\s*x?\s*talk|panel\s+discussion|longevity|healthcare\s+revolutions?|aerial|drone\s+shot|hospital\s+exterior|establishing\s+shot|legos?|mgtow|hiroshima|atomic\s+bomb|warzone|war\s*zone|cnn\s*10|breast\s+implants?|plastic\s+surg(?:ery|eon)?|cong\s+hoa|saigon|burn\s+ward|adventure\s+eight|medical\s+city\s+arlington|scottsdale.?s?\s+cure\s+corridor|penfield\s+reading|ltc\s+lakin|obama.?s?\s+eligibility|scooter\s+vs\s+car|garland\s+isd|school\s+district|classroom\s+(?:demo|presentation)|students?\s+watching|children\s+seated|da\s*vinci\s+surgical\s+system\s+overview|neuralink\s+robot|school\s+nurse|wendy\s+cummings|whhi|world\s+laparoscopy|circumc(?:ision|ure)|organ\s+harvesting|ukraine\s+pow|al\s+funduq|kissing\s+and\s+love|rhino\s+(?:ct|scan)|board\s+of\s+commissioners|exhibition\s+hall|trade\s*show(?:\s+floor)?|conference\s+(?:booth|floor|expo\s+floor)|expo\s+(?:floor|booth|hall)|\bhimss\b|ces\s+(?:20\d{2}|conference|show)|health\s+(?:it\s+)?summit\s+(?:booth|floor|expo)|ai\s+(?:summit|conference)\s+(?:booth|floor|hall|product\s+demo)|medical\s+trade\s+show|healthcare\s+(?:expo|trade\s+show)|suit\s+(?:walk(?:ing)?|stroll(?:ing)?)|body\s+language\s+(?:healthcare|medical|clinical|edition|coaching|mistakes?)|healthcare\s+edition|nvidia\s+(?:ai\s+)?(?:for\s+)?(?:healthcare|life\s+sciences|health\s+systems?)|ai\s+patel|why\s+ai\s+[a-z]{3,}\s+why\s+ai|jada\s+pemble|meet\s+our\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+medical\s+lab|helium\s+used\s+in\s+(?:the\s+)?medical\s+(?:field|imaging)|not\s+just\s+for\s+balloons\s+helium|milestone\s+celebration|maple\s+grove\s+hospital|medcram(?:\.com)?|(?:online\s+medical\s+learning|how)\s+(?:can\s+)?pa\s+schools?\s+(?:can\s+)?benefit|pa\s+schools?\s+(?:can\s+)?benefit(?:\s+from\s+medcram)?|nurses?\s+at\s+celebrity\s+eclipse|celebrity\s+eclipse\s+(?:medical|medical\s+facility)|(?:maryland\s+)?women.?s?\s+heritage\s+center|honor\s+nurses?\s+(?:from\s+)?wwi|wwi\s+(?:heritage\s+center|nurses?)|emergency\s+1972|1972\s+tv\s+series|bilibili\s+(?:chill|sakura|ai\s+debug)|sakura\s+(?:chill|ai\s+debug)|chill\s+sakura|ai\s+debug\s+pad|blurry\s+test\s*tubes?|test\s*tube\s+(?:close\s*up|b-?roll|stock|only|filler)|petri\s+dish\s*(?:close\s*up|b-?roll|stock|only)?|blurry\s+lab|corporate\s+(?:presentation|healthcare\s+keynote|logo\s+interview)|conference\s+(?:center\s+booth|presentation\s+stage)|product\s+(?:launch\s+stage|presentation\s+floor)|health\s+(?:tech|information\s+technology)\s+conference\s+(?:floor|booth|expo|keynote)|jackthreads|jack\s*threads|geekbeat(?:\.tv)?|unlock(?:ing)?\s+(?:your\s+)?(?:old\s+)?iphone|\bmlk\b|martin\s+luther\s+king|why\s+america\s+may\s+go\s+to\s+hell|this\s+or\s+that|metro\s+edition|che\s+guevara|imperialism|palestine\s+deepdive|bald\s+truth|why\s+do\s+i\s+innovate|hair\s+transplant|artas\s+hair|sri\s+ponni|bayer\s+(?:logo|booth|keynote|presentation)|bayer|dr\.?\s+elias|elias.?s?\s+blind\s+spot|david\s*(?:&|and)\s*elias|logo\s+stage|keynote\s+stage|game\s+show|martial\s+law|senate\s+passes|congressional\s+hearing|david\s+daleiden|brookhaven|dies?\s+in\s+lebanon|denied\s+hospital\s+care|gaza\s+s?\s+wounded|palestine\s+red\s+crescent|prcs|episode\s+\d+|split[\s-]?screen\s+(?:podcast|interview)|high\s+schooler|transgender\s+critical|news\s+storage)\b/i.test(blob)
    )
  ) {
    return true;
  }
  // Bare apartment-building-exterior establishing shots (no face, no people) are
  // weaker than a generic face for the hook. Clips that also carry face evidence
  // escape via hasReadableFaceVisual → introFaceTier ≥ 1 upstream.
  if (
    housing
    && /\bapartment\s+building\s+exterior\b/i.test(blob)
    && !hasReadableFaceVisual(asset)
  ) {
    return true;
  }
  // Passive paperwork / hands-on-desk never leads the hook on any topic;
  // scarcity fallbacks (relaxed tier / coverage) still admit it when the
  // pool holds nothing else, so thin intros never render as a gap.
  if (isPassiveDeskIntroVisual(asset)) return true;
  return airline && (
    /\b(mailbox|mail box|u\.?s\.?\s*mail|usps|postal|envelopes?|paperwork|documents?|financial|bank statement|invoice|receipt|tax form)\b/.test(blob)
    || AIRLINE_LIMITED_CLUSTERS.has(visualSubjectCluster(asset))
  );
}

function isBrightCabinInterior(asset) {
  const blob = assetBlob(asset);
  return /\b(cabin|airplane interior|aircraft interior|plane interior|passenger seats?|aisle|overhead bins?)\b/.test(blob)
    && /\b(bright|daylight|sunny|well.?lit|window light|interior)\b/.test(blob);
}

/** A human face the viewer can read, not a distant figure or a back-of-head shot. */
export function hasReadableFaceVisual(asset) {
  if (isBackViewDeadAir(asset)) return false;
  const blob = assetBlob(asset);
  return /\b(face|faces|portrait|close.?up|eyes|expression|reaction|worried|shocked|crying|smiling)\b/.test(blob)
    && /\b(passengers?|pilots?|attendants?|crew|traveller?s?|person|people|woman|women|man|men|family|couple|tenants?|landlords?|residents?)\b/.test(blob);
}

const AIRLINE_TOPICAL_VISUAL_RE = /\b(airline|aircraft|airplane|aviation|cabin|cockpit|oxygen|jet|passenger|attendant|hangar|airport|pilot|plane|flight)\b/;
const HOUSING_TOPICAL_VISUAL_RE = /\b(evict(?:ion|ed)?|landlords?|tenants?|lease|rent(?:al)?|notice|apartment|housing|home|house|keys|court|foreclos\w*)\b/;

/** Nature / establishing stock with no lived-in housing or readable human. */
const LANDSCAPE_ONLY_INTRO_RE =
  /\b(landscape|mountain|lake|lakeside|river|forest|nature\s+scenic|scenic\s+view|countryside|wildfire|helicopter|aerial(?:\s+view)?|rolling\s+hills|beach|sunset|ocean|sea\s+waves|subic\s+bay|bay|harbour|harbor|naval|home\s+movie|vietnam|war\s+footage|re[\s-]?supply)\b/;

/** Empty suburban/residential street pads — fine in body, never the housing hook. */
const HOUSING_STREET_ESTABLISHING_RE =
  /\b(suburban\s+street|residential\s+street|neighborhood\s+street|quiet\s+street|empty\s+street|tree[\s-]?lined\s+street|palm\s+trees?|stucco\s+homes?|driveway|residential\s+neighborhood)\b/;

const HOUSING_LIVED_IN_RE =
  /\b(modern\s+apartment|apartment\s+interior|living\s+room|kitchen|hallway|tenant|evict(?:ion|ed)?|for\s+rent|packing\s+boxes|lease|landlord|worried\s+(?:couple|family)|family\s+apartment)\b/;

/** Tenant/rent webinars are talking-head motion even when alt omits "face". */
const HOUSING_TALKING_HEAD_RE =
  /\b(webinar|workshop|tenant\s+relief|rent\s+program|habitability|tenant[\s-]focused|eviction\s+moratorium|landlord\s+tenant\s+act|tenant\s+advocacy|lawyers?\s+committee|eviction\s+laws?|tenant\s+rights)\b/;

/**
 * True when metadata is landscape/nature establishing with no apartment or
 * face signal — never OK as a housing hook opener when better clips exist.
 */
export function isLandscapeOnlyIntroVisual(asset) {
  const evidence = assetEvidenceBlob(asset);
  const blob = assetBlob(asset);
  // War/naval/bay Archive titles win over aspirational face queries ("worried
  // couple…") and over bare "home" inside "home movie".
  if (
    HOUSING_WAR_NAVAL_ESTABLISHING_RE.test(evidence || blob)
    && !HOUSING_LIVED_IN_RE.test(evidence)
  ) {
    return true;
  }
  // Suburban street establishing (web16 opener) — demote unless lived-in/face evidence.
  if (
    HOUSING_STREET_ESTABLISHING_RE.test(evidence || blob)
    && !HOUSING_LIVED_IN_RE.test(evidence)
    && !hasReadableFaceVisual({ ...asset, query: '' })
  ) {
    return true;
  }
  if (!LANDSCAPE_ONLY_INTRO_RE.test(evidence || blob)) return false;
  // Face / topical escapes must come from evidence, not harvest query spoofing.
  const evidenceAsset = {
    ...asset,
    query: '',
    title: asset?.title,
    alt: asset?.alt,
  };
  if (hasReadableFaceVisual(evidenceAsset)) return false;
  if (HOUSING_LIVED_IN_RE.test(evidence) || HOUSING_TOPICAL_VISUAL_RE.test(evidence)) return false;
  if (
    /\b(face|portrait|close.?up|people|person|couple|family|worried|shocked)\b/.test(evidence)
    && /\b(tenant|landlord|resident|home|house|apartment)\b/.test(evidence)
  ) {
    return false;
  }
  return true;
}

/** Modern apartment / lived-in housing motion suitable for the hook opener. */
export function isHousingApartmentMotion(asset) {
  if (isLandscapeOnlyIntroVisual(asset)) return false;
  const blob = assetBlob(asset);
  if (HOUSING_LIVED_IN_RE.test(blob)) return true;
  return /\bapartment\b/.test(blob)
    && /\b(people|person|couple|family|interior|room|door|keys|tenant|evict)\b/.test(blob);
}

/**
 * Tenant/rent webinar or workshop clips — OK as housing *body* filler when face
 * keywords are missing, but never as the hook opener (web17: static chair → raw 4.6).
 */
export function isHousingTalkingHeadMotion(asset) {
  if (isLandscapeOnlyIntroVisual(asset)) return false;
  if (!(asset?.type === 'video' || /\.mp4/i.test(asset?.url || ''))) return false;
  const evidence = assetEvidenceBlob(asset);
  if (!HOUSING_TALKING_HEAD_RE.test(evidence)) return false;
  return HOUSING_TOPICAL_VISUAL_RE.test(evidence) || HOUSING_LIVED_IN_RE.test(evidence);
}

const HEALTHCARE_TOPICAL_VISUAL_RE =
  /\b(doctor|physician|clinician|nurse|patient|hospital|clinic|mri|radiology|diagnosis|surgery|surgical|medical|healthcare|lab\s*coat|stethoscope)\b/;

/**
 * First-3s priority for airline/housing/healthcare hooks: a readable human face on a
 * topical frame (2) beats any readable face or housing apartment motion (1)
 * beats other lead visuals (0). Landscape-only housing stock is -1.
 * Healthcare title-card / Giphy openers are -1.
 */
export function introFaceTier(asset, { airline = false, housing = false, healthcare = false } = {}) {
  // Housing landscape / webinar / chair / home-tour and healthcare title cards → -1.
  if (housing && isRejectedIntroLeadVisual(asset, { housing: true })) return -1;
  if (healthcare && isRejectedIntroLeadVisual(asset, { healthcare: true })) return -1;
  if (healthcare) {
    // Evidence only — harvest query must not mint tier-2 from "surgical robot" alone
    // when the title is GeekBeat / Bayer / innovate (web43 opener spoof).
    const blob = assetEvidenceBlob(asset);
    // Tier-2 signals: OR/surgical-robot/radiologist-workstation motion.
    // Broad match captures CNBC titles ("robot that can diagnose"), da Vinci OR,
    // radiologist at workstation, and any clinician+screen combination.
    // Science Nation is always medical/scientific context — no qualifier required.
    const clinicianScreenOrOr =
      /\b(ai\s+radiolog|radiolog\w*\s+ai|surgical\s*robot(?:ics?)?|robot(?:ic)?\s*surger|da\s*vinci\s*(?:surg|robot|OR)|cnbc\s+(?:surgical|robot|da\s*vinci|diagnos)|science\s+nation|onyx\s*rad(?:\s+ai|\s+radiol)?|ultrasound\s+(?:demo|demonstration)|mri\s+(?:monitor|screen)|pointing\s+at\s+(?:the\s+)?(?:monitor|screen)|operating\s+room|or\s+(?:suite|table|lights?)|radiologist\s+(?:workstation|screen|monitor|reads?|reviewing)|tiny\s+incision|hsc.{0,20}surgical\s+robot|robotic\s+surgery\s+live|live\s+robotic\s+surgery|laparoscopic\s+surgery\s+(?:live|OR)|intraoperative|surgical\s+OR\s+lights?)\b/i.test(blob)
      || (
        /\b(doctor|clinician|radiologist|physician|surgeon)\b/i.test(blob)
        && /\b(monitor|screen|mri|radiolog|ultrasound|scan)\b/i.test(blob)
      );
    if (
      /\b(talking\s*heads?|explainer|lecture|studio\s+interview|why\s+do\s+i\s+innovate|blind\s+spot|corporate\s+(?:logo|stage|interview))\b/i.test(blob)
      && !clinicianScreenOrOr
    ) {
      return 0;
    }
    if (clinicianScreenOrOr && (asset?.type === 'video' || /\.mp4/i.test(asset?.url || ''))) {
      return 2;
    }
  }
  if (hasReadableFaceVisual(asset)) {
    const blob = assetBlob(asset);
    const topical = (airline && AIRLINE_TOPICAL_VISUAL_RE.test(blob))
      || (housing && HOUSING_TOPICAL_VISUAL_RE.test(blob))
      || (healthcare && (HEALTHCARE_TOPICAL_VISUAL_RE.test(blob) || hasHealthcareEvidence(asset)));
    return topical ? 2 : 1;
  }
  // Housing: lived-in apartment motion without a strict face tag still beats
  // landscape / Archive establishing for the opener (web14).
  if (housing && isHousingApartmentMotion(asset)) return 1;
  // Healthcare: clinical evidence motion (MRI/doctor/hospital) without a strict
  // face tag still beats Coursera/Giphy title cards for the opener.
  if (healthcare && hasHealthcareEvidence(asset) && (asset?.type === 'video' || /\.mp4/i.test(asset?.url || ''))) {
    return 1;
  }
  return 0;
}

function isAirlineIntroLeadVisual(asset) {
  if (isRejectedIntroLeadVisual(asset, { airline: true })) return false;
  const blob = assetBlob(asset);
  const hasCabin = /\b(cabin|airplane interior|aircraft interior|plane interior|passenger seats?|aisle|overhead bins?|flight attendant|cabin crew)\b/.test(blob);
  const hasCockpit = /\b(cockpit|flight deck)\b/.test(blob);
  const hasPassengerFace = /\b(passenger|pilot|attendant|crew|traveler|person|people|woman|man|family)\b/.test(blob)
    && /\b(face|faces|worried|shocked|reaction|portrait|close.?up|eyes)\b/.test(blob);
  return hasCockpit || hasCabin || hasPassengerFace || isBrightCabinInterior(asset);
}

function isIntroLeadVisual(asset, { airline = false, cameraStory = false, housing = false, healthcare = false } = {}) {
  if (airline) return isAirlineIntroLeadVisual(asset);
  if (isRejectedIntroLeadVisual(asset, { housing, healthcare })) return false;
  // A surveillance frame is the subject on camera stories, not dead air.
  if (cameraStory && isSurveillanceVisual(asset)) return true;
  const blob = assetBlob(asset);
  if (housing) {
    return hasReadableFaceVisual(asset)
      || isHousingApartmentMotion(asset)
      || /\b(face|faces|person|people|worried|shocked|portrait|close.?up|couple|family|tenant)\b/.test(blob);
  }
  if (healthcare) {
    return hasReadableFaceVisual(asset)
      || hasHealthcareEvidence(asset)
      || HEALTHCARE_TOPICAL_VISUAL_RE.test(blob);
  }
  return /\b(face|faces|person|people|worried|shocked|portrait|close.?up|passenger|pilot|attendant|crew|flight attendant|cabin crew|cockpit|flight deck)\b/.test(blob)
    || isBrightCabinInterior(asset);
}

/** Heuristic overlap between asset metadata and a beat subject/excerpt. */
export function scoreAssetAgainstBeat(asset, beat) {
  if (!beat) return 0;
  const blob = assetBlob(asset);
  for (const avoid of beat.mustAvoid || []) {
    if (avoid && blob.includes(String(avoid).toLowerCase())) return -8;
  }
  const subject = tokens(beat.searchableSubject || '');
  const excerpt = tokens(beat.narrationExcerpt || '').slice(0, 10);
  let hits = 0;
  for (const t of subject) {
    if (blob.includes(t)) hits += 1;
  }
  let excerptHits = 0;
  for (const t of excerpt) {
    if (blob.includes(t)) excerptHits += 1;
  }
  const beatContext = `${beat.searchableSubject || ''} ${beat.narrationExcerpt || ''}`;
  if (isGenericStockJunk(blob, beatContext)) return -6;
  if (/stock photo|b-roll footage|generic corporate/.test(blob) && hits === 0) return -4;
  return hits * 2 + excerptHits;
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

/**
 * Proportional sentence start within a segment (narration-aligned when no whisper sidecar).
 * @param {object} beat
 * @param {object} seg
 * @param {number} duration
 */
export function beatStartSecForBeat(beat, seg, duration) {
  if (!beat || !seg || duration <= 0) return 0;
  const sentences = splitSentences(seg.narration || '');
  if (!sentences.length) return 0;
  const idx = Math.min(Math.max(0, beat.sentenceIndex ?? 0), sentences.length - 1);
  const totalChars = sentences.reduce((sum, line) => sum + line.length, 0) || 1;
  let charsBefore = 0;
  for (let i = 0; i < idx; i += 1) charsBefore += sentences[i].length;
  return (charsBefore / totalChars) * duration;
}

/**
 * Pick the beat active for a local time within a segment.
 * Uses sentenceIndex + narration proportion when beats carry sentence metadata;
 * falls back to even spacing otherwise.
 * @param {object[]} beats
 * @param {number} localSec
 * @param {number} duration
 * @param {object} [seg]
 */
export function beatAtSegmentTime(beats, localSec, duration, seg = null) {
  if (!beats?.length) return null;
  if (seg && beats.some((b) => typeof b.sentenceIndex === 'number')) {
    const ranked = beats
      .map((beat) => ({
        beat,
        start: beatStartSecForBeat(beat, seg, duration),
      }))
      .sort((a, b) => a.start - b.start);
    let active = ranked[0]?.beat ?? beats[0];
    for (const { beat, start } of ranked) {
      if (start <= localSec + 0.01) active = beat;
    }
    return active;
  }
  if (beats.length === 1 || duration <= 0) return beats[0];
  const idx = Math.min(
    beats.length - 1,
    Math.max(0, Math.floor((localSec / duration) * beats.length)),
  );
  return beats[idx];
}

export function buildEditTimeline(project, options = {}) {
  let cut = options.cutIntervalSec ?? 1.25;
  const reason = options.reason ?? 'heuristic placement';
  const preferVideo = options.preferVideo !== false;
  const entries = [];
  const globalPool = uniqueAssetsByUrl(project.media || []);
  const urlUseCount = new Map();
  const maxReusePerUrl = options.maxReusePerUrl ?? 1;
  const uniqueVideos = uniqueAssetsByUrl((project.media || []).filter((m) => m.type === 'video'));
  const totalDur = (project.script || []).reduce((sum, seg) => sum + (Number(seg.duration) || 0), 0);
  const coldEval = isEvalColdMode();
  const topicIsAirline = isAirlineTopic(project.topic || '');
  const MAX_BODY_CUT_SEC = 1.25;
  const MAX_BODY_CUT_THIN_SEC = 2.0;
  /** When ≥3 unique URLs exist, body cuts must not freeze longer than this. */
  const MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC = 2.5;
  const ENOUGH_URLS_FOR_SNAPPY_CUTS = 3;
  const RECENT_URL_WINDOW = 4;
  /** Rich pool: ≥12 unique URLs (or ≥2× segment count) → tighter hold cap and anti-reuse. */
  const RICH_POOL_URL_THRESHOLD = 12;
  const MAX_BODY_HOLD_RICH_POOL_SEC = 1.5;
  /**
   * Opening window anti-reuse. Rich pools, medium pools (≥6 URLs), and housing
   * with ≥4 unique URLs use ≤1 use per URL in the first 15s — keyless housing
   * often lands in the 6–11 URL band that missed the old rich-only gate.
   */
  const FIRST_WINDOW_SEC = 15;
  const FIRST_WINDOW_STRICT_CAP = 1;
  const MEDIUM_POOL_URL_THRESHOLD = 6;
  // Thin-pool over-reuse guard. A source URL may appear at most twice inside the
  // opening window (and, for short videos, across the whole timeline) whenever
  // an unused alternative still exists — this defeats the "same clip ×4 in the
  // first sample" failure that hardMaxReuse / ping-pong logic let through for
  // thin keyless pools. Enforced on every pick pass except the final `relaxed`
  // fallback, which drops the cluster/look-back preferences and only then
  // relaxes to hardMaxReuse, so a genuinely thin pool still renders full
  // coverage (a fresh same-cluster clip, never a gap) instead of looping.
  const STRICT_REUSE_CAP = 2;
  const STRICT_REUSE_WINDOW_SEC = 30;
  const SHORT_VIDEO_MAX_SEC = 75;
  const isShortVideo = totalDur > 0 && totalDur <= SHORT_VIDEO_MAX_SEC;
  // The look-back must always leave candidates: with a 4-URL pool a 4-wide
  // window bans everything and the previous cut freezes for the whole segment.
  const uniqueUrlCount = new Set(globalPool.map((a) => urlKey(a)).filter(Boolean)).size;
  const segmentCount = (project.script || []).length;
  // Require ≥8 absolute URLs for the relative leg so thin 1-segment pools
  // (e.g. 6 clips over 150s) don't trigger rich-pool caps.
  const isRichPool = uniqueUrlCount >= RICH_POOL_URL_THRESHOLD
    || (segmentCount > 0 && uniqueUrlCount >= 8 && uniqueUrlCount >= 2 * segmentCount);
  const topicIsHousing = !coldEval && isHousingTopic(project.topic || '');
  const applyFirstWindowStrict = isRichPool
    || uniqueUrlCount >= MEDIUM_POOL_URL_THRESHOLD
    || (topicIsHousing && uniqueUrlCount >= 4);
  // Widen the look-back window for rich pools so the same clip can't re-surface
  // after only 4 cuts; leave ≥2 candidates always reachable.
  const richPoolWindow = isRichPool ? Math.min(RECENT_URL_WINDOW + 2, uniqueUrlCount - 2) : RECENT_URL_WINDOW;
  const recentUrlWindow = Math.max(0, Math.min(richPoolWindow, uniqueUrlCount - 2));
  // Keep requested cut for pacing. Dynamic hard-cap: generic topics top out at
  // 6; airline + housing are stricter and lengthen cuts rather than looping.
  const HARD_MAX_REUSE_CEIL = topicIsAirline && coldEval && uniqueVideos.length >= 20
    ? 2
    : (topicIsAirline || topicIsHousing)
      ? 3
      : 6;
  const HARD_MAX_REUSE_FLOOR = Math.min(3, HARD_MAX_REUSE_CEIL);
  let effectiveMaxReuse = maxReusePerUrl;
  let hardMaxReuse = HARD_MAX_REUSE_FLOOR;
  let effectiveCut = cut;
  if (uniqueVideos.length > 0 && totalDur > 0 && cut > 0) {
    const bodyCut = Math.min(cut, MAX_BODY_CUT_SEC);
    const clipsNeeded = totalDur / bodyCut;
    hardMaxReuse = Math.min(
      HARD_MAX_REUSE_CEIL,
      Math.max(HARD_MAX_REUSE_FLOOR, Math.ceil(clipsNeeded / uniqueVideos.length)),
    );
    if (!topicIsAirline && !topicIsHousing && coldEval && uniqueVideos.length >= 20) {
      hardMaxReuse = Math.min(4, hardMaxReuse);
    }
    if (clipsNeeded > uniqueVideos.length * effectiveMaxReuse) {
      // Housing with enough URLs: lengthen holds instead of inflating reuse —
      // repeating one crash/landscape URL tanks variety. Generic topics still
      // raise effectiveMaxReuse toward hardMax so thin pools stay covered.
      const honorMaxReuse = topicIsHousing
        && uniqueUrlCount >= ENOUGH_URLS_FOR_SNAPPY_CUTS;
      if (!honorMaxReuse) {
        effectiveMaxReuse = Math.min(
          hardMaxReuse,
          Math.max(effectiveMaxReuse, Math.ceil(clipsNeeded / uniqueVideos.length)),
        );
      }
    }
    effectiveMaxReuse = Math.min(effectiveMaxReuse, hardMaxReuse);
    const maxSlots = uniqueVideos.length * hardMaxReuse;
    if (totalDur / Math.min(effectiveCut, MAX_BODY_CUT_SEC) > maxSlots) {
      // Housing honors hardMax=3: allow holds past the snappy 2.5s ceiling when
      // that is the only way to cover duration without 4× URL loops.
      const holdNeeded = totalDur / maxSlots;
      const holdCeiling = topicIsHousing
        ? Math.max(MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC, holdNeeded)
        : uniqueUrlCount >= ENOUGH_URLS_FOR_SNAPPY_CUTS
          ? MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC
          : MAX_BODY_CUT_THIN_SEC;
      effectiveCut = Math.min(holdCeiling, Math.max(cut, holdNeeded));
    }
    if (uniqueUrlCount >= ENOUGH_URLS_FOR_SNAPPY_CUTS && !topicIsHousing) {
      effectiveCut = Math.min(effectiveCut, MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC);
    }
    // Rich pool: tighter hold so a single download-clip source can't dominate —
    // but never so tight that hardMaxReuse would be exceeded for coverage.
    if (isRichPool) {
      const richFloor = totalDur > 0 && maxSlots > 0 ? totalDur / maxSlots : 0;
      if (richFloor > MAX_BODY_HOLD_RICH_POOL_SEC) {
        // Need longer holds to stay under hardMax — prefer that over looping.
        effectiveCut = Math.min(
          topicIsHousing ? Math.max(MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC, richFloor) : MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC,
          Math.max(effectiveCut, richFloor),
        );
      } else {
        effectiveCut = Math.min(effectiveCut, MAX_BODY_HOLD_RICH_POOL_SEC);
      }
    }
  } else {
    hardMaxReuse = HARD_MAX_REUSE_CEIL;
  }
  const topicIsWorkplace = isWorkplaceTopic(project.topic || '');
  const topicIsCameraStory = CAMERA_STORY_RE.test(project.topic || '');
  const topicIsHealthcare = !coldEval && isHealthcareTopic(project.topic || '');
  const introLeadOptions = {
    airline: topicIsAirline,
    cameraStory: topicIsCameraStory,
    housing: topicIsHousing,
    healthcare: topicIsHealthcare,
  };
  // Hooks open on a readable face when one exists, on any topic — detected
  // independently of cold-eval so the rule holds in every mode. Camera
  // stories are the one exception: the surveillance frame is the intended
  // lead subject there, so it competes with faces on score alone.
  const faceTierOptions = {
    airline: topicIsAirline,
    housing: topicIsHousing,
    healthcare: topicIsHealthcare,
  };
  const faceFirstIntroTopic = !topicIsCameraStory;
  const beatSheet = project.visualBeatSheet;
  const beatsBySeg = new Map();
  const recentTimelineUrls = [];
  // Full cross-segment pick history. The capped look-back window above
  // shrinks to 1 with exactly 3 unique URLs (so it can leave candidates), so
  // it cannot see an alternating pair on its own — ping-pong detection needs
  // the uncapped trail of picked URLs.
  const timelinePickUrlHistory = [];
  // Opening-window cluster trail for pattern interrupts (force a subject change
  // after two same-cluster non-human cuts in the first 15s).
  const timelinePickClusterHistory = [];
  // Cumulative timeline seconds emitted by prior segments — segment-local `t`
  // resets to 0 each segment, so this is what places a pick within the video's
  // opening window for the strict reuse cap.
  let timelineElapsedSec = 0;
  let airlineLimitedClusterUseTotal = 0;
  let previousTimelineUrl = null;
  let previousTimelineCluster = null;
  for (const b of beatSheet?.beats || []) {
    const list = beatsBySeg.get(b.segmentId) || [];
    list.push(b);
    beatsBySeg.set(b.segmentId, list);
  }

  for (const seg of project.script || []) {
    const segmentUrlUse = new Map();
    let assets = uniqueAssetsByUrl((project.media || []).filter((m) => m.segmentId === seg.id));
    if (!assets.length) {
      // Borrow from global pool; prefer face/CTA motion.
      assets = uniqueAssetsByUrl(
        [...globalPool]
          .sort((a, b) => {
            const score = (x) => {
              const blob = `${x.query || ''} ${x.alt || ''}`.toLowerCase();
              if (/puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -5;
              if (/face|person|worried|hospital|records?|laptop|verify/i.test(blob)) return 2;
              return x.type === 'video' ? 1 : 0;
            };
            return score(b) - score(a);
          })
          .map((m) => ({ ...m, segmentId: seg.id })),
      );
    }
    if (!assets.length) continue;

    const videos = assets.filter((a) => a.type === 'video');
    const images = assets.filter((a) => a.type !== 'video');
    const script = project.script || [];
    const isIntro =
      seg.type === 'intro'
      || (seg === script[0] && seg.type !== 'body' && seg.type !== 'outro' && seg.type !== 'section');
    const isOutro =
      seg.type === 'outro'
      || (seg === script[script.length - 1] && !['body', 'intro', 'section'].includes(seg.type));
    const topicBlob = `${project.topic || ''} ${seg.narration || ''} ${seg.title || ''}`;
    const segBeats = beatsBySeg.get(seg.id) || [];
    const reuseCountFor = (key, introOutroOnly) => {
      if (!key) return 0;
      // Always enforce the global cap. Intro/outro also track per-segment uses
      // so a clip cannot burn the whole hardMax inside one bookend segment —
      // but never ignore global uses (that previously allowed 3×3 = 9–12 reuse).
      const globalUses = urlUseCount.get(key) || 0;
      if (introOutroOnly) {
        return Math.max(globalUses, segmentUrlUse.get(key) || 0);
      }
      return globalUses;
    };
    // `ignoreReuse` yields the intrinsic fit of a clip, so scarcity fallbacks can
    // tell a banned pad from an on-topic clip that has simply been used already.
    const scoreAsset = (a, activeBeat = null, { ignoreReuse = false } = {}) => {
      const blob = assetBlob(a);
      const key = urlKey(a);
      const introOutroReuse = isIntro || isOutro;
      const priorUses = ignoreReuse ? 0 : reuseCountFor(key, introOutroReuse);
      // Soft anti-reuse across the timeline (non-adjacent too): after 2 uses,
      // heavily prefer fresh perceived variety before the hard cap is reached.
      let reusePenalty = 0;
      if (priorUses === 1) reusePenalty = -5;
      if (priorUses >= 2) reusePenalty = -25 - (priorUses - 2) * 12;
      // A repeated archive/sim clip reads as a hard loop even when it scores
      // topically. Demote it further on any prior use so a fresher (even
      // lower-scoring) clip wins the slot before the reuse cap is reached.
      if (priorUses >= 1 && isArchiveOrSimStock(a)) reusePenalty -= 12;
      // Same for crash/stock loop visuals — one car-crash URL must not dominate.
      if (priorUses >= 1 && isCrashOrStockLoopVisual(a)) reusePenalty -= 14;
      // Motion-over-still preference is enforced in canUseCandidate for the first
      // 15s (hard block while unused videos remain) — do not soft-demote stills
      // here or neutral images fall out of borrowPool (score < 0) and freeze cuts.
      reusePenalty += stillQualityTimelinePenalty(a);
      if (isOffBrandVisual(blob, topicBlob)) return -8;
      if (isGenericStockJunk(blob, topicBlob)) return -8;
      // Hard-ban office/cowork pads on non-workplace stories.
      if (
        !topicIsWorkplace
        && (/office|coworking|open.?plan|imac|boardroom|conference room|corporate office|bright office daylight/i.test(blob)
          || visualSubjectCluster(a) === 'office')
      ) {
        return -20;
      }
      // Dark window vignettes / B&W stock read as dead air under captions.
      if (/\b(airplane window|plane window|cabin window)\b/.test(blob) && /\b(night|dark|silhouette|black)\b/.test(blob)) {
        return -15;
      }
      if (/\b(black and white|b&w|monochrome|grayscale)\b/.test(blob)) return -6;
      // Intro must lead with faces / bright cabin — not distant runway silhouettes.
      if (isIntro) {
        if (isIntroLeadVisual(a, introLeadOptions)) {
          reusePenalty += 6;
        }
        if (isRejectedIntroLeadVisual(a, {
          airline: topicIsAirline,
          housing: topicIsHousing,
          healthcare: topicIsHealthcare,
        })) {
          return -12;
        }
      }
      if (topicIsAirline && !/airline|aircraft|airplane|aviation|cabin|cockpit|oxygen|runway|jet|passenger|attendant|hangar|airport|pilot|plane|flight/i.test(blob)) {
        // Soft demote off-story stock on airline topics (faces still ok).
        if (!/face|person|people|worried|shocked|portrait|close.?up/i.test(blob)) reusePenalty -= 4;
      }
      if (/architectural model|architecture model|scale model|conference room|skyline|corporate office|business district|empty park|people in park|press conference|news desk|office desk/i.test(blob)) return -6;
      // Housing intro: landscape/lake establishing is never a valid hook cut.
      if (isIntro && topicIsHousing && isLandscapeOnlyIntroVisual(a)) return -12;
      // Housing-market stories: car-crash / dashcam stock is the wrong "crash".
      if (topicIsHousing && isCrashOrStockLoopVisual(a) && /car crash|dash ?cam|wreck|pile.?up|highway accident|auto accident/i.test(blob)) {
        return -12;
      }
      if (topicIsHousing && /moving boxes|packing boxes|cardboard boxes|boxes hallway/i.test(blob)) return -2;
      if (isBackViewDeadAir(a)) return -14;
      if (/microphone|podcast|recording studio|asmr|rode|sequin|fashion runway|puppet|beetle|insect|cartoon|minecraft/i.test(blob)) return -5;
      if (/camcorder|handheld camcorder|person holding camera|holding camcorder|vintage camera|filming with phone|dslr camera/i.test(blob)) return -4;
      const airlineLimitedCluster = visualSubjectCluster(a);
      if (topicIsAirline && AIRLINE_LIMITED_CLUSTERS.has(airlineLimitedCluster)) {
        reusePenalty -= airlineLimitedClusterUseTotal > 0 ? 30 : 12;
      }
      // Demote dark/muddy stock.
      if (/\b(night|dark|silhouette|low.?light|underexposed|muddy|dimly|shadowy|black background|black frame)\b/i.test(blob)) {
        return -5;
      }
      const preferBright = process.env.AUTOTUBE_PREFER_BRIGHT_BROLL === '1';
      if (preferBright && /\b(overexposed|blown.?out|washed.?out)\b/i.test(blob)) {
        return -4;
      }
      let beatBoost = 0;
      if (activeBeat) {
        beatBoost = scoreAssetAgainstBeat(a, activeBeat);
        // First 3s: require beat match when available.
        if (isIntro && beatBoost < 0) return -6;
      } else if (segBeats.length) {
        beatBoost = Math.max(...segBeats.map((b) => scoreAssetAgainstBeat(a, b)));
      }
      // Intro/outro: topic relevance first.
      if (isIntro || isOutro) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.15 ? -4 : Math.round(rel * 5);
        if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court/i.test(blob)) score += 3;
        if (isIntro && topicIsHousing && isHousingApartmentMotion(a)) score += 4;
      if (isIntro && topicIsHealthcare && hasHealthcareEvidence(a)) score += 4;
      if (isIntro && topicIsHealthcare && /giphy\.com|coursera|capitol|protest/i.test(blob)) score -= 12;
        if (!coldEval && /nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance|wheelchair/i.test(blob)) score += 5;
        // Hook needs a face; care/CCTV outranks generic faces on nursing.
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up|portrait|eyes/i.test(blob)) {
          score += !coldEval && /nursing|elderly|care\s*home|cctv|abuse/i.test(topicBlob) ? 1 : 4;
        }
        // Airline/housing hooks open on an empty establishing shot only when
        // no readable face outranks it; topical faces outrank generic faces.
        // Housing also boosts apartment-motion tier-1 via introFaceTier.
        if (isIntro && faceFirstIntroTopic && introFaceTier(a, faceTierOptions) > 0) {
          score += 4 + introFaceTier(a, faceTierOptions);
        }
        // Cold intro: beat match outranks establishing stock.
        if (coldEval && isIntro && beatBoost > 0) score += beatBoost * 2;
        if (isOutro && /checklist|subscribe|relieved|direct.?camera|verify|call/i.test(blob)) score += 2;
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 2;
        return score + beatBoost + reusePenalty;
      }
      if (!coldEval && /nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance/i.test(blob)) return 3 + beatBoost + reusePenalty;
      if (topicIsHousing && /beetle|insect|wildlife|macro|spider|bug|larva|caterpillar/i.test(blob)) return -10;
      if (topicIsHousing && /evict|landlord|tenant|lease|rent|notice|apartment|keys|court|couple|worried/i.test(blob)) return 2 + beatBoost + reusePenalty;
      // Cold body: topic relevance + faces beat looping subject stock.
      if (coldEval) {
        const rel = scoreAssetRelevance(a, seg, project.topic || '');
        let score = rel < 0.12 ? -2 : Math.round(rel * 4);
        if (/face|person|people|couple|worried|shocked|reaction|family|close.?up|portrait|crew|pilot|driver|paramedic/i.test(blob)) {
          score += 3;
        }
        if (preferBright && /\b(daylight|sunny|bright|well.?lit|window light)\b/i.test(blob)) score += 1;
        return score + beatBoost + reusePenalty;
      }
      if (/face|person|people|couple|worried|shocked|reaction|tenant|family|close.?up|portrait/i.test(blob)) return 3 + beatBoost + reusePenalty;
      return beatBoost + reusePenalty;
    };
    // Banned subjects stay out even when reuse penalties drag the on-topic
    // clips negative, so scarcity can never promote a beetle into the cut.
    const dropNeverUse = (pool) => {
      const clean = pool.filter((a) => !isNeverUseVisual(a));
      return [...(clean.length ? clean : pool)];
    };
    // Bookends carry the hook and the CTA: motion only when motion exists.
    const bookendCandidates = (pool) => {
      const motion = pool.filter((a) => a.type === 'video');
      return dropNeverUse(motion.length ? motion : pool);
    };
    // Borrowing from other segments must not pull in clips the scorer bans
    // outright (office pads, off-brand stock): repeating an on-topic clip a
    // beat sooner reads better than cutting to a banned pad.
    const borrowPool = (isIntro || isOutro ? bookendCandidates(globalPool) : [...globalPool])
      .map((a) => ({ ...a, segmentId: seg.id }))
      .filter((a) => scoreAsset(a) >= 0);
    // Intro/outro: motion only when videos exist. Body: mostly video.
    // When the segment is still-only but the global pool has motion, seed the
    // early cut list from global videos so the first 15s are not Ken-Burns pads.
    let earlyMotionSeed = [];
    if (preferVideo && !videos.length && uniqueVideos.length) {
      earlyMotionSeed = uniqueAssetsByUrl(
        uniqueVideos
          .map((a) => ({ ...a, segmentId: seg.id }))
          .sort((a, b) => scoreAsset(b) - scoreAsset(a))
          .filter((a) => scoreAsset(a) >= 0),
      );
    }
    const ordered = preferVideo && (videos.length || earlyMotionSeed.length)
      ? (() => {
          if (isIntro || isOutro) {
            const ranked = bookendCandidates(videos).sort((a, b) => scoreAsset(b) - scoreAsset(a));
            let usable = uniqueAssetsByUrl(ranked.filter((a) => scoreAsset(a) >= 0));
            if (!usable.length) usable = uniqueAssetsByUrl(ranked.slice(0, 1));
            // Borrow enough unique motion for dense intro cuts.
            const introSlotsNeeded = Math.max(4, Math.ceil((seg.duration || 20) / Math.min(cut, 0.65)));
            if (usable.length < introSlotsNeeded && globalPool.length) {
              const extras = uniqueAssetsByUrl(
                bookendCandidates(globalPool)
                  .filter((a) => a.type === 'video' && !usable.some((u) => u.id === a.id || urlKey(u) === urlKey(a)))
                  .map((a) => ({ ...a, segmentId: seg.id }))
                  .sort((a, b) => scoreAsset(b) - scoreAsset(a))
                  .filter((a) => scoreAsset(a) >= 0),
              );
              usable = uniqueAssetsByUrl([...usable, ...extras]).slice(0, Math.max(8, introSlotsNeeded));
            }
            return usable.length ? usable : uniqueAssetsByUrl(ranked.slice(0, 1));
          }
          const motionPool = videos.length ? videos : earlyMotionSeed;
          const ranked = dropNeverUse(motionPool).sort((a, b) => scoreAsset(b) - scoreAsset(a));
          const usable = uniqueAssetsByUrl(ranked.filter((a) => scoreAsset(a) >= 0));
          if (usable.length) return usable;
          const out = [];
          let vi = 0;
          let ii = 0;
          const total = Math.max(assets.length, 8);
          const pickVideo = () => {
            for (let j = 0; j < ranked.length; j++) {
              const candidate = ranked[(vi + j) % ranked.length];
              const key = urlKey(candidate);
              if (key && (urlUseCount.get(key) || 0) >= effectiveMaxReuse) continue;
              vi += 1;
              return candidate;
            }
            const fallback = ranked[vi % ranked.length];
            vi += 1;
            return fallback;
          };
          for (let k = 0; k < total; k += 1) {
            if (k % 4 !== 3 && videos.length) {
              out.push(pickVideo());
            } else if (images.length) {
              out.push(images[ii % images.length]);
              ii += 1;
            } else if (videos.length) {
              out.push(pickVideo());
            }
          }
          return uniqueAssetsByUrl(out.length ? out : assets);
        })()
      : assets;

    const duration = seg.duration || 20;
    // When a body segment has ≤2 distinct still URLs and no video, force a longer
    // hold per cut so ffmpeg Ken-Burns animation has room to breathe.  A 1.25 s
    // ping-pong between two Archive stills reads as slideshow; at ≥4 s each still
    // the directional zoom/pan motion is clearly visible before the next cut.
    const segUniqueUrlSet = new Set(assets.map((a) => urlKey(a)).filter(Boolean));
    const onlyTwoStillsInSeg = !isIntro && !isOutro && segUniqueUrlSet.size <= 2 && videos.length === 0;
    const STILL_PAIR_HOLD_SEC = 4.0;
    const interval = isIntro
      ? Math.min(effectiveCut, 0.65)
      : onlyTwoStillsInSeg
        ? Math.max(effectiveCut, STILL_PAIR_HOLD_SEC)
        : effectiveCut;
    // Medium/housing first-15s: stretch body cuts only while inside the opening
    // window so unique URLs can cover ≤1 use each without slowing the whole body.
    // Stretch medium pools, and housing even when the relative rich-pool gate
    // trips at 8 URLs (keyless housing-web) — otherwise 1.5s cuts force 2× reuse
    // inside the first 15s. Non-housing rich pools (≥12 URLs) keep ≤1.5s cuts.
    const earlyWindowStretch = (
      applyFirstWindowStrict
      && (!isRichPool || topicIsHousing)
      && !isIntro
      && !isOutro
      && uniqueUrlCount >= 4
    ) ? Math.max(effectiveCut, FIRST_WINDOW_SEC / uniqueUrlCount) : interval;
    const maxReuseThisSeg = isIntro || isOutro ? 1 : effectiveMaxReuse;
    const usableBodyVideos = (!isIntro && !isOutro && videos.length)
      ? uniqueAssetsByUrl(videos.filter((a) => scoreAsset(a) >= 0))
      : [];
    const segEnoughUrls = usableBodyVideos.length >= ENOUGH_URLS_FOR_SNAPPY_CUTS;
    const segMaxBodyHoldSec = segEnoughUrls
      ? (isRichPool ? MAX_BODY_HOLD_RICH_POOL_SEC : MAX_BODY_HOLD_WHEN_ENOUGH_URLS_SEC)
      : MAX_BODY_CUT_THIN_SEC;
    let t = 0;
    let ai = 0;
    let segmentEntryCount = 0;
    let lastAssetId = null;
    let lastUrl = null;
    let lastCluster = null;
    while (t < duration - 0.05) {
      const globalStartSec = timelineElapsedSec + t;
      const cutNow = (
        !isIntro
        && !isOutro
        && applyFirstWindowStrict
        && globalStartSec < FIRST_WINDOW_SEC
      ) ? earlyWindowStretch : interval;
      const end = Math.min(duration, t + cutNow);
      const withinStrictReuseWindow = globalStartSec < STRICT_REUSE_WINDOW_SEC || isShortVideo;
      const activeBeat = beatAtSegmentTime(segBeats, t, duration, seg);
      const introLeadWindow = seg === script[0] && t < 3;
      const introOutroReuse = isIntro || isOutro;
      const violatesConsecutiveCluster = (candidate) => {
        const cluster = visualSubjectCluster(candidate);
        if (cluster === 'other') return false;
        if (!previousTimelineCluster || cluster !== previousTimelineCluster) return false;
        const key = urlKey(candidate);
        return !(isHumanCluster(cluster) && key && key !== previousTimelineUrl);
      };
      // Block a candidate that would complete an A B A B alternation (…X, Y,
      // X then Y again) when a usable third URL exists to cut to instead.
      // With fewer than 3 usable URLs the escape pool is empty and the
      // alternation is the best available coverage, so it stands.
      const continuesTwoClipPingPong = (candidate) => {
        if (isIntro || isOutro) return false;
        const key = urlKey(candidate);
        if (!key || timelinePickUrlHistory.length < 3) return false;
        const back3 = timelinePickUrlHistory[timelinePickUrlHistory.length - 3];
        const back2 = timelinePickUrlHistory[timelinePickUrlHistory.length - 2];
        const back1 = timelinePickUrlHistory[timelinePickUrlHistory.length - 1];
        if (back3 !== back1 || back2 === back1 || key !== back2) return false;
        const pair = new Set([back1, back2]);
        // Escape eligibility reads intrinsic fit (reuse ignored) — a third
        // URL that has been used once is still a valid escape; the use-count
        // ceiling is enforced separately below.
        const escapePool = uniqueAssetsByUrl([...ordered, ...borrowPool]).filter((c) => {
          const escapeKey = urlKey(c);
          return escapeKey && !pair.has(escapeKey) && scoreAsset(c, null, { ignoreReuse: true }) >= 0;
        });
        return escapePool.some((c) => {
          const escapeKey = urlKey(c);
          if (!escapeKey || escapeKey === key) return false;
          if (escapeKey === lastUrl) return false;
          const uses = reuseCountFor(escapeKey, introOutroReuse);
          return uses < hardMaxReuse;
        });
      };
      // First 15s pattern interrupt: after two same non-human clusters, force a
      // subject change when a different-cluster alternative exists.
      const continuesOpeningClusterPattern = (candidate) => {
        if (globalStartSec >= FIRST_WINDOW_SEC) return false;
        if (timelinePickClusterHistory.length < 2) return false;
        const cluster = visualSubjectCluster(candidate);
        if (cluster === 'other' || isHumanCluster(cluster)) return false;
        const back1 = timelinePickClusterHistory[timelinePickClusterHistory.length - 1];
        const back2 = timelinePickClusterHistory[timelinePickClusterHistory.length - 2];
        if (cluster !== back1 || cluster !== back2) return false;
        return uniqueAssetsByUrl([...ordered, ...borrowPool]).some((c) => {
          const cCluster = visualSubjectCluster(c);
          if (cCluster === cluster || cCluster === 'other') return false;
          const escapeKey = urlKey(c);
          if (!escapeKey || escapeKey === lastUrl) return false;
          if (scoreAsset(c, null, { ignoreReuse: true }) < 0) return false;
          return reuseCountFor(escapeKey, introOutroReuse) < hardMaxReuse;
        });
      };
      // True only when a *never-used* motion URL remains (not merely under
      // hardMax). Otherwise a single video would block all stills forever and
      // freeze the cut via hold-extension.
      const hasUnusedMotionAlternative = () => uniqueVideos.some((v) => {
        const vk = urlKey(v);
        if (!vk || vk === lastUrl) return false;
        return reuseCountFor(vk, introOutroReuse) === 0;
      });
      const hasFreshUrlAlternative = () => globalPool.some((a) => {
        const k = urlKey(a);
        if (!k || k === lastUrl) return false;
        return reuseCountFor(k, introOutroReuse) === 0;
      });
      const diversityScore = (candidate) => {
        let s = scoreAsset(candidate, activeBeat);
        // Soft anti-repeat of the same subject cluster (not just adjacent URL).
        if (!isIntro && !isOutro && lastCluster) {
          const cluster = visualSubjectCluster(candidate);
          if (cluster === lastCluster && cluster !== 'human' && cluster !== 'other') s -= 4;
        }
        return s;
      };
      // `relaxed` drops the look-back / lead-visual / cluster preferences only.
      // Adjacent repeats and the hard reuse cap stay enforced at every tier.
      const canUseCandidate = (candidate, { allowOverReuse = false, relaxed = false } = {}) => {
        if (!candidate) return false;
        const key = urlKey(candidate);
        if (candidate.id === lastAssetId || (key && key === lastUrl)) return false;
        // Housing intro 0–3s: landscape / webinar / chair / home-tour stay banned
        // even on the relaxed pass so low-energy openers cannot win the hook.
        if (
          introLeadWindow
          && topicIsHousing
          && isRejectedIntroLeadVisual(candidate, { housing: true })
        ) {
          return false;
        }
        if (!relaxed) {
          if (introLeadWindow && !isIntroLeadVisual(candidate, introLeadOptions)) return false;
          if (key && recentTimelineUrls.includes(key)) return false;
          if (violatesConsecutiveCluster(candidate)) return false;
          if (continuesTwoClipPingPong(candidate)) return false;
          if (continuesOpeningClusterPattern(candidate)) return false;
          // First 15s: prefer motion over Ken-Burns stills while unused videos remain.
          if (
            globalStartSec < FIRST_WINDOW_SEC
            && preferVideo
            && candidate.type !== 'video'
            && uniqueVideos.length > 0
            && hasUnusedMotionAlternative()
          ) {
            return false;
          }
        }
        const uses = reuseCountFor(key, introOutroReuse);
        // Never exceed hard max — even as last resort (stops 9–12× loops).
        if (key && uses >= hardMaxReuse) return false;
        // Crash/stock URLs: hard-cap at 1 use in the opening window when an
        // alternative exists (stops the web14 "same car crash ×N" loop).
        if (
          !relaxed
          && key
          && globalStartSec < FIRST_WINDOW_SEC
          && uses >= 1
          && isCrashOrStockLoopVisual(candidate)
          && hasFreshUrlAlternative()
        ) {
          return false;
        }
        // Strict opening-window / short-video cap: no URL past 2 uses while an
        // alternative is still reachable. Enforced on every pick pass except the
        // final `relaxed` fallback — that one drops the cluster/look-back
        // preferences too, so it can reach a fresh same-cluster clip instead of
        // looping this one, and only relaxes to hardMax when the pool is
        // genuinely too thin to offer any alternative (never renders a gap).
        if (
          !relaxed
          && key
          && withinStrictReuseWindow
          && uses >= STRICT_REUSE_CAP
        ) {
          return false;
        }
        // First 15s ≤1 reuse for rich/medium/housing pools. On the relaxed
        // path, keep the cap only while a fresh URL still exists — otherwise
        // thin pools fall through to coverage instead of freezing.
        if (
          key
          && applyFirstWindowStrict
          && globalStartSec < FIRST_WINDOW_SEC
          && uses >= FIRST_WINDOW_STRICT_CAP
          && (!relaxed || hasFreshUrlAlternative())
        ) {
          return false;
        }
        if (!allowOverReuse && key && uses >= maxReuseThisSeg) return false;
        // Never over-reuse office pads on non-workplace topics.
        if (
          !topicIsWorkplace
          && visualSubjectCluster(candidate) === 'office'
          && uses >= 1
        ) {
          return false;
        }
        if (topicIsAirline) {
          const airlineLimitedCluster = visualSubjectCluster(candidate);
          if (
            AIRLINE_LIMITED_CLUSTERS.has(airlineLimitedCluster)
            && airlineLimitedClusterUseTotal >= 1
          ) {
            return false;
          }
        }
        return true;
      };
      const pickFrom = (pool, { allowOverReuse = false, relaxed = false } = {}) => {
        const rankedPool = (activeBeat || relaxed || (coldEval && !isIntro && !isOutro))
          ? [...pool].sort((a, b) => diversityScore(b) - diversityScore(a))
          : pool;
        if (!rankedPool.length) return null;
        // First 3s of airline/housing hooks: exhaust topical readable faces,
        // then any readable face, before falling through to other lead
        // visuals. Reuse caps and adjacency rules still apply at every tier.
        if (!relaxed && introLeadWindow && faceFirstIntroTopic) {
          for (const minTier of [2, 1]) {
            for (let j = 0; j < rankedPool.length; j++) {
              const candidate = rankedPool[(ai + j) % rankedPool.length];
              if (introFaceTier(candidate, faceTierOptions) < minTier) continue;
              if (canUseCandidate(candidate, { allowOverReuse, relaxed })) return candidate;
            }
          }
          // No strict readable face found (Archive stills often lack role-word metadata).
          // Housing: prefer apartment/lived-in motion next, then human-cluster /
          // portrait-like assets — never landscape establishing for the opener.
          if (topicIsHousing) {
            for (let j = 0; j < rankedPool.length; j++) {
              const candidate = rankedPool[(ai + j) % rankedPool.length];
              if (!isHousingApartmentMotion(candidate)) continue;
              if (canUseCandidate(candidate, { allowOverReuse, relaxed })) return candidate;
            }
          }
          for (let j = 0; j < rankedPool.length; j++) {
            const candidate = rankedPool[(ai + j) % rankedPool.length];
            if (topicIsHousing && isLandscapeOnlyIntroVisual(candidate)) continue;
            const cluster = visualSubjectCluster(candidate);
            const blob = assetBlob(candidate);
            const isPortraitLike = isHumanCluster(cluster)
              || /\b(portrait|close.?up|person|people)\b/.test(blob);
            if (!isPortraitLike) continue;
            if (canUseCandidate(candidate, { allowOverReuse, relaxed })) return candidate;
          }
        }
        for (let j = 0; j < rankedPool.length; j++) {
          const candidate = rankedPool[(ai + j) % rankedPool.length];
          if (canUseCandidate(candidate, { allowOverReuse, relaxed })) return candidate;
        }
        if (!allowOverReuse) return null;
        // Last-resort: least-used under hardMax only.
        const underCap = rankedPool.filter((candidate) => canUseCandidate(candidate, { allowOverReuse: true, relaxed }));
        if (!underCap.length) return null;
        return underCap.reduce((best, candidate) => {
          const key = urlKey(candidate);
          const count = reuseCountFor(key, introOutroReuse);
          const bestKey = urlKey(best);
          const bestCount = reuseCountFor(bestKey, introOutroReuse);
          if (topicIsHousing && !isIntro && scoreAsset(candidate, activeBeat) < 0) return best;
          if (diversityScore(candidate) !== diversityScore(best)) {
            return diversityScore(candidate) > diversityScore(best) ? candidate : best;
          }
          return count < bestCount ? candidate : best;
        }, underCap[0]);
      };

      const leastUsedFirst = (a, b) => {
        const countDelta = reuseCountFor(urlKey(a), introOutroReuse) - reuseCountFor(urlKey(b), introOutroReuse);
        if (countDelta !== 0) return countDelta;
        return diversityScore(b) - diversityScore(a);
      };

      // Prefer segment pool → unused global URLs → over-reuse last resort.
      let asset =
        pickFrom(ordered)
        || (!isIntro && !isOutro ? pickFrom(borrowPool) : null)
        || pickFrom(ordered, { allowOverReuse: true })
        || pickFrom(borrowPool, { allowOverReuse: true });
      if (!asset) {
        // Nothing satisfies the diversity preferences: take the best relaxed
        // candidate under hardMax rather than freezing the previous cut.
        const pool = uniqueAssetsByUrl([...ordered, ...borrowPool]);
        asset = pool
          .filter((c) => canUseCandidate(c, { allowOverReuse: true, relaxed: true }))
          .sort(leastUsedFirst)[0] || null;
      }
      if (!asset && segmentEntryCount > 0) {
        const prev = entries[entries.length - 1];
        // Cap the hold at ~2–3s only when coverage offers an intrinsically
        // acceptable refresh (never-use and scorer-banned subjects — e.g.
        // airline paperwork/mail clusters past their one global use — do not
        // count). Otherwise holding the current clip beats cutting to a
        // banned subject, and a truly thin pool must not render a gap.
        const coveragePool = uniqueAssetsByUrl([
          ...ordered,
          ...(isIntro || isOutro ? bookendCandidates(globalPool) : globalPool),
        ]);
        const coverageHasAlternative = uniqueUrlCount >= ENOUGH_URLS_FOR_SNAPPY_CUTS
          && coveragePool.some((c) => {
            const key = urlKey(c);
            if (c.id === lastAssetId || (key && key === lastUrl)) return false;
            if (isNeverUseVisual(c)) return false;
            return scoreAsset(c, activeBeat, { ignoreReuse: true }) >= 0;
          });
        const capEnd = coverageHasAlternative ? prev.startSec + segMaxBodyHoldSec : end;
        const cappedEnd = Math.min(end, capEnd);
        if (cappedEnd > prev.endSec + 0.01) {
          entries[entries.length - 1].endSec = cappedEnd;
          t = cappedEnd;
          continue;
        }
        // Hold cap reached — fall through to coverage instead of extending further.
      }
      if (!asset) {
        // A segment with no cut at all renders as a gap, so cover it with the
        // best-fitting clip even when that means passing the reuse cap.
        const coverage = uniqueAssetsByUrl([
          ...ordered,
          ...(isIntro || isOutro ? bookendCandidates(globalPool) : globalPool),
        ]).filter((c) => c.id !== lastAssetId && !(urlKey(c) && urlKey(c) === lastUrl));
        const clean = coverage.filter((c) => !isNeverUseVisual(c));
        const base = clean.length ? clean : coverage;
        const intrinsic = (c) => scoreAsset(c, activeBeat, { ignoreReuse: true });
        const onBrand = base.filter((c) => intrinsic(c) >= 0);
        // Spread reuse first: this last-resort path is where a single high-fit
        // archive/sim clip used to loop 4×+ (it wins on intrinsic fit while its
        // reuse is ignored). Picking the least-used URL first — fit only as a
        // tiebreak — keeps coverage varied instead of hammering one clip.
        // Stay under hardMax whenever any under-cap clip exists. Only when every
        // URL is already at hardMax (truly thin pool) may we exceed — and even
        // then pick the least-used URL so one crash clip cannot run away to 6×.
        const underHardMax = (onBrand.length ? onBrand : base).filter((c) => {
          const k = urlKey(c);
          const uses = reuseCountFor(k, introOutroReuse);
          if (k && uses >= hardMaxReuse) return false;
          if (
            applyFirstWindowStrict
            && globalStartSec < FIRST_WINDOW_SEC
            && uses >= FIRST_WINDOW_STRICT_CAP
            && hasFreshUrlAlternative()
          ) {
            return false;
          }
          return true;
        });
        const coveragePick = underHardMax.length ? underHardMax : (onBrand.length ? onBrand : base);
        asset = coveragePick.sort((a, b) => {
          const reuseDelta = reuseCountFor(urlKey(a), introOutroReuse) - reuseCountFor(urlKey(b), introOutroReuse);
          if (reuseDelta !== 0) return reuseDelta;
          return intrinsic(b) - intrinsic(a);
        })[0] || null;
      }
      if (!asset) {
        t = end;
        continue;
      }
      entries.push({
        segmentId: seg.id,
        startSec: t,
        endSec: end,
        assetId: asset.id,
        reason: activeBeat ? `beat:${activeBeat.id || activeBeat.searchableSubject || 'match'}` : reason,
      });
      segmentEntryCount += 1;
      const assetUrl = urlKey(asset) || null;
      lastAssetId = asset.id;
      lastUrl = assetUrl;
      lastCluster = visualSubjectCluster(asset);
      previousTimelineUrl = assetUrl;
      previousTimelineCluster = lastCluster;
      if (assetUrl && recentUrlWindow > 0) {
        recentTimelineUrls.push(assetUrl);
        while (recentTimelineUrls.length > recentUrlWindow) recentTimelineUrls.shift();
      }
      if (assetUrl) timelinePickUrlHistory.push(assetUrl);
      if (lastCluster) timelinePickClusterHistory.push(lastCluster);
      if (lastUrl) {
        // Always count globally so hardMax is timeline-wide, not per-segment.
        urlUseCount.set(lastUrl, (urlUseCount.get(lastUrl) || 0) + 1);
        if (isIntro || isOutro) {
          segmentUrlUse.set(lastUrl, (segmentUrlUse.get(lastUrl) || 0) + 1);
        }
      }
      if (topicIsAirline && AIRLINE_LIMITED_CLUSTERS.has(lastCluster)) {
        airlineLimitedClusterUseTotal += 1;
      }
      t = end;
      ai += 1;
    }
    timelineElapsedSec += duration;
  }

  return entries;
}

/**
 * @param {object} project
 * @param {string} segmentId
 * @returns {object[]}
 */
export function mediaForSegment(project, segmentId) {
  const pool = project.media || [];
  let segMedia = pool.filter((m) => m.segmentId === segmentId);
  if (!segMedia.length && pool.length) {
    segMedia = pool.map((a) => ({ ...a, segmentId }));
  }
  return segMedia;
}

/**
 * Rebuild editTimeline when sanitize/balance invalidated asset IDs.
 * @param {object} project
 * @param {{ cutIntervalSec?: number }} [options]
 */
export function validateEditTimeline(project, options = {}) {
  const mediaIds = new Set((project.media || []).map((m) => m.id));
  const timeline = project.editTimeline || [];
  let stale = 0;
  for (const entry of timeline) {
    if (!mediaIds.has(entry.assetId)) stale += 1;
  }
  const staleRatio = timeline.length ? stale / timeline.length : 1;
  const rebuilt = staleRatio > 0.1 || timeline.length === 0;
  if (rebuilt) {
    project.editTimeline = buildEditTimeline(project, {
      cutIntervalSec: options.cutIntervalSec ?? 1.25,
      maxReusePerUrl: options.maxReusePerUrl ?? 1,
      reason: 'post-sanitize rebuild',
    });
  }
  return { rebuilt, staleCount: stale, staleRatio, clipCount: project.editTimeline.length };
}
