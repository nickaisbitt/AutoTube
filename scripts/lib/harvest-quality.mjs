/**
 * Harvest quality gates: topic/segment relevance + per-segment volume.
 */
import { isAirlineTopic, isCovidTopic, isHealthcareTopic, isHeistTopic, isHousingTopic, isNursingHomeTopic, isWorkplaceTopic } from './topic-family.mjs';
import { isEvalColdMode } from './eval-flags.mjs';
import { isJunkWebVolumeStillUrl, isUnsafeMediaUrl } from './stock-media-urls.mjs';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'your', 'our', 'their', 'its', 'his', 'her', 'my',
  'me', 'him', 'them', 'us', 'also', 'still', 'even', 'back', 'because', 'while', 'like',
  'get', 'got', 'make', 'made', 'say', 'said', 'says', 'one', 'two', 'new', 'now', 'way',
]);

/** Generic topic words that alone should not keep an asset on-topic. */
const WEAK_TOPIC_WORDS = new Set([
  'tiktok', 'live', 'stream', 'streamed', 'video', 'news', 'breaking', 'viral',
  'social', 'media', 'online', 'watch', 'footage', 'clip', 'trending', 'update',
]);

/**
 * Shared essay words on cabin-pressure topics that also match games, physics
 * homework, wildfire "failures", and tech clickbait. Never count these alone.
 */
const AIRLINE_AMBIGUOUS_TOPIC_WORDS = new Set([
  'pressure', 'pressures', 'failure', 'failures', 'failing', 'failed',
  'hidden', 'hiding', 'hid', 'final', 'means', 'report', 'reports',
  'recurring', 'regional', 'keep', 'kept', 'cabin',
]);

/** Topic-level tokens that strongly indicate off-topic harvest noise. */
const OFF_TOPIC_BLOCKLIST = [
  { pattern: /\btrump\b/i, requires: /\btrump|president|white house|election|maga\b/i },
  { pattern: /\bbiden\b/i, requires: /\bbiden|president|white house|election\b/i },
  { pattern: /\bdemocracy forum\b/i, requires: /\bdemocracy|athens forum\b/i },
  { pattern: /\bwallpaper\b/i, requires: /\bwallpaper|desktop background\b/i },
  { pattern: /\bfood poisoning\b/i, requires: /\bfood poisoning|salmonella|e\.?\s*coli\b/i },
  { pattern: /\belectric car fire\b/i, requires: /\belectric car|ev fire|tesla fire\b/i },
];

/** Off-brand visual junk (beetles, puppets, cartoons); allowed only if topic matches. */
export const OFF_BRAND_VISUAL_RE =
  /\b(puppet|muppet|marionette|sock\s*puppet|claymation|stop[\s-]?motion|cartoon|anime|animated\s+character|animation\s+reel|minecraft|fortnite|gameplay|macro\s*insect|beetle|dung\s*beetle|insect|bug\s+macro|larva|caterpillar|spider\s+macro|ant\s+colony|wildlife\s+macro|hud\s+graphic|sci[\s-]?fi\s+hud)\b/i;

/** Blurry / soft-focus stock. */
export const BLURRY_LOW_QUALITY_RE =
  /\b(blurry|out of focus|out-of-focus|defocused|soft focus|low.?res|pixelat|grainy|unfocused)\b/i;

/** Grainy found-footage aesthetics that fight clean captions. */
export const FOUND_FOOTAGE_AESTHETIC_RE =
  /\b(found[\s-]?footage|vhs|film grain|heavy grain|noisy footage|lo-?fi video|retro camcorder aesthetic)\b/i;

/**
 * Film-strip / reel graphics and film-leader countdowns — Archive.org wrapper
 * art (sprocket borders, academy leaders, clapperboards) scraped as if it were
 * documentary B-roll. Wave F watch report flagged these leaking into airline cuts.
 */
export const FILM_STRIP_GRAPHIC_RE =
  /\b(film[\s-]?strips?|filmstrips?|film\s+reels?|movie\s+reels?|cinema\s+reels?|film\s+leader|academy\s+leader|countdown\s+leader|film\s+countdown|leader\s+countdown|sprocket\s+holes?|celluloid|clapper[\s-]?boards?|clapboards?|film\s+slate|(?:8|16|35)\s*mm\s+film|film\s+negative\s+strip|film\s+frames?\s+(?:border|overlay)|old[\s-]?film\s+(?:effect|overlay|border|frame))\b/i;

/** Topics that legitimately show film strips/reels (film history, archives, cinema). */
export const FILM_TOPIC_CONTEXT_RE =
  /\b(films?|filmmaker|cinema|movies?|reels?|archival|projection(?:ist)?|hollywood|celluloid)\b/i;

/** Washed-out / overexposed stock. */
export const OVEREXPOSED_STOCK_RE =
  /\b(overexposed|blown.?out|washed.?out|high.?key white|bleached white|too bright)\b/i;

/** Staged reenactment B-roll that tanks documentary credibility. */
export const STAGED_REENACT_RE =
  /\b(staged|reenactment|re-?enact|dramatization|dramatised|dramatized|actors pretending|mock scenario|reenacted scene)\b/i;

/** Produce/grocery literal matches (e.g. Pixabay "produce" token). */
export const PRODUCE_GROCERY_JUNK_RE =
  /\b(vegetable crate|produce crate|grocery stock|fruit market|food crate|farmers market|supermarket aisle|grocery aisle|vegetable market)\b/i;

/** Empty hospital-bed stills with no patient/caregiver context. */
export const EMPTY_HOSPITAL_BED_RE =
  /\b(empty hospital bed|hospital bed only|unmade hospital bed|empty ward bed|blurry bed|hospital bed close|empty medical bed)\b/i;

/** Overused camcorder / “person holding camera” loops on non-surveillance topics. */
export const CAMCORDER_STOCK_LOOP_RE =
  /\b(camcorder|handheld (camcorder|camera)|person holding (a )?camera|holding (a )?(camcorder|camera)|vintage (video )?camera|filming with (a )?(camcorder|camera|phone)|old (video )?camera|super.?8|home movie camera)\b/i;

/** Generic corporate / architecture filler for serious investigation topics. */
export const GENERIC_CORPORATE_FILLER_RE =
  /\b(corporate handshake|team meeting smiling|empty office|business people walking|stock footage loop|generic corporate|open plan office|open-?plan|glass building skyline|architecture model|architectural model|scale model|conference room|office meeting|skyline timelapse|press conference|news desk|talking head office|office desk laptop|business handshake|coworkers laughing|modern office interior|coworking(?:\s+space)?|boardroom|executive desk|city office window|imac|people working at desks?|office interior|coworking desk|startup office|bright office daylight)\b/i;

/** Press / mic / podcast pads that read as generic explainer stock. */
export const PRESS_MIC_PODCAST_FILLER_RE =
  /\b(podcast microphone|studio microphone|condenser mic|rode mic|asmr mic|radio host desk|interview mic close.?up|microphone only|empty podcast studio|recording booth empty)\b/i;

/** Overused eviction/housing B-roll loops (boxes/stressed tenant without narrative anchor). */
export const HOUSING_STOCK_LOOP_RE =
  /\b(moving boxes|packing boxes|cardboard boxes|tenant moving boxes|boxes hallway|stress(ed)? (woman|man|person) apartment|for rent sign only|empty apartment room)\b/i;


/**
 * Off-topic disaster / civic / chart B-roll that tanks housing watch scores.
 * "Housing crash" stories scrape car-crash, wildfire, council, quake, and pie-chart
 * clips; hard-reject those — never bare "crash" (market-crash query echo).
 */
export const HOUSING_OFF_TOPIC_BROLL_RE =
  /\b(?:car\s+crash|traffic\s+accident|auto(?:mobile)?\s+accident|dashcam(?:\s+(?:crash|footage|video))?|vehicle\s+(?:collision|wreck|crash)|wrecked\s+car|highway\s+accident|road\s+accident|pile[\s-]?up|car\s+wreck|crash\s+footage|accident\s+(?:footage|scene)|plane\s+crash(?:es)?|crashes?\s+into\s+(?:a\s+)?(?:roof|house|home)|crash\s+patterns?|wildfire|forest\s+fires?|house\s+fire|apartment\s+fire|fire\s+destroys\s+apartment|alarm\s+fire|structure\s+fire|building\s+(?:on\s+)?fire|burning\s+(?:building|house|home|apartment)|fire\s+footage|fire\s+department|ladder\s+truck|firefighters?|airstrike|air\s*strike|war\s+zone|vietnam\s+war|war\s+home\s+movie|gaza(?:\s+strip)?|deir\s+al\s+balah|city\s+council|council\s+meeting|city\s+hall|public\s+(?:hearing|meeting)|town\s+hall(?:\s+meeting)?|board\s+meeting|building\s+commission|plan(?:ning)?\s+commission|city\s+commission|zoning\s+(?:board|hearing|commission)|commission\s+(?:hearing|meeting)|ribbon\s+cutting|apartments?\s+approved|earthquake|quake|tsunami|pie\s+chart|poll\s+graphic|opinion\s+poll|infographic|lending\s*tree|bar\s+chart|can\s*tv|station\s+id|satellite\s+map|digital\s+globe|house\s+on\s+(?:a\s+)?rock|floating\s+(?:rock|island)|3d\s+house|neohomeloans|housing\s+market\s+crash\.jpg|will-the-housing-market-crash|queen\s+elizabeth|royal\s+memorial|ticking\s+time\s+bombs?|time\s+bombs?|sticks?\s+of\s+dynamite|dynamite|periscope\s*film|bird'?s?\s+nests?|ceiling\s+on\s+your\s+home|propaganda\s+film|leapfrog|letter\s+factory|miss\s+brooks|cafeteria\s+strike|love\s+nest|camp\s+mystic|guadalupe\s+river|texas\s+flooding|flood(?:ing)?\s+(?:map|camp|index)|(?:j\.?\s*g\.?\s*)?ballard|cronenberg|david\s+crosby|literacy\s+adam|rolfe\s+report|i\s+got\s+a\s+strike\s+again|progress\s+center|self\s+sufficiency|fair\s+housing\s+conference|county\s+announces|administrative\s+officer|apartment\s+building\s+inspection|building\s+inspection\s+initiative|for\s+sale\s+sign|re\/?max|yard\s+sign|realtor\s+sign|real\s+estate\s+sign|homes?\s*scv|one57|million\s+apartment|touring\s+a\s+\d|negative\s+space|ron\s+koertge|animated\s+film|michael\s+jackson|michael\s+bolton|michael\s+ninn|end\s+the\s+fed|mousetrap|american\s+home\s+mortgage|mortgage\s+bankruptcy|bankruptcy\s+(?:slide|filing|graphic)|golden\s+valley\s+approves|what\s+happens\s+when\s+the\s+(?:housing|credit)|credit\s+hit\s+market|housing\s+market\s+crash(?:es)?\?|crater\s+graphic|landlord\s+tenant\s+act|lawyers?\s+committee|tenant\s+advocacy|square[\s-]?foot|sustainable\s+high\s+rise|eviction\s+ban\s+nonsense|may\s+day\s+caravan|constitutional\s+shredding|how\s+to\s+live\s+in|livestream\s+archive|business\s+insider|(?:gaming\s+)?headset|podcast\s+mic(?:rophone)?|youtubers?|youtube\s+flag|like\s+and\s+subscribe|subscribe\s+button|streamer\s+(?:setup|headset|mic)|talking\s+head\s+(?:with\s+)?(?:a\s+)?headset|trump\s+voters?|pennsylvania\s+rally|political\s+rally|homestead\s+rescue|going\s+garcia|meet\s+the\s+garcias?|smaldones?|family\s+of\s+crime|struggle\s+street|karina\s+garcia|autumn\s+nelon|nelon\s+streetman|joked\s+about\s+housing|federal\s+reserve\s+officials?\s+foresaw|rent\s+strike|general\s+rent\s+strike|strike\s+against\s+(?:rent|landlord)|parkdale\s+vs|parkdale\s+(?:rent|tenant|protest)|ltb\s+(?:hearing|order|ruling|decision|application|review)|ontario\s+landlord\s+tenant\s+board|landlord\s+tenant\s+board\b|rent\s+tribunal|housing\s+tribunal\s+hearing|nl\s+subs?|dutch\s+(?:subs?|subtitles?)|eerst\s+het\s+eten\s+dan\s+de\s+huur|home\s+price\s+chart|housing\s+price\s+chart|median\s+home\s+price\s+graphic|cbs\s*6|problem\s+solvers?|wtvr|odsp|bill\s*60|push\s+more\s+disable|disable\s+residents?|soviet\s+flag|hammer\s+and\s+sickle|ussr|moldova\s+construction|construction\s+project\s+presentation|redfin\s+(?:just\s+)?dropped|redfin\s+predictions?|2026\s+predictions?|satisfed\s+in\s+real\s+estate|zillow\s+economist|corelogic|great\s+recession\s+unlikely|gaming\s+chair|leather\s+office\s+chair|bathroom\s+bucket|toilet\s+bowl|floor\s+drain|dirty\s+bathroom|moldy\s+bathroom|crash\s+is\s+here|yellow\s+turban|overthinking\s+quotes?|cummins|diesel\s+engine|rocker\s+arm|isl\s+8\.9|zillow\s+chart|chart\s+graph|key\s+insights|decline\s+in\s+airbnb|airbnb\s+(?:going\s+to\s+)?cause|tariffs?\s*,?\s*70%|81%\s+worry|data\s+visualization|nmp\b|wants\s+a\s+housing\s+crash)\b/i;

/** Reason string when housing harvest media is disaster/meeting/chart junk. */
export function housingOffTopicBrollReason(haystack, contextText = '') {
  if (!isHousingTopic(contextText)) return '';
  if (HOUSING_OFF_TOPIC_BROLL_RE.test(String(haystack || ''))) {
    return 'housing off-topic disaster/meeting/chart B-roll';
  }
  return '';
}

/**
 * Off-topic conspiracy / disaster / meme / art B-roll that tanks healthcare watch
 * scores (healthcare-web1 raw 5.2; web3 raw 4.6). Hard-reject Huxley/Orwell/EXPOSED
 * clickbait, FEMA storm PSAs, insects, peas memes, classical paintings, literary
 * festivals, Archive maternity/ritual (kapparot), news talking-head studio pads,
 * COVID propaganda leftovers, and Coursera lecture slides — keep clinical/AI/
 * hospital/doctor/patient/lab / radiology-screen motion.
 *
 * Also hard-reject exhibition-hall / trade-show / conference-booth / tech-expo
 * clips scraped via "surgical robot" / "AI healthcare" queries but filmed on
 * a conference floor without clinical use (healthcare-web11 suit/exhibition opener).
 */
export const HEALTHCARE_OFF_TOPIC_BROLL_RE =
  /\b(?:aldous\s+huxley|huxley|george\s+orwell|orwell|brave\s+new\s+world|1984|dystopian?|conspiracy(?:\s*(?:theory|theories|bait|doc(?:umentary)?))?|deep\s+state|new\s+world\s+order|(?:truth|secrets?|agenda|elites?|government)\s+exposed|healthcare\s+exposed|fema|hurricane(?:\s+\w+)?\s+(?:fema|assistance|psa|relief|recovery)|tornado(?:\s+(?:anniversary|coverage|warning|damage|recovery))?|storm\s+(?:recovery|restoration|warning|damage|psa)|community\s+recovery\s+after\s+disaster|disaster\s+(?:recovery|relief|psa|outreach|footage)|cockroach(?:es)?|roach(?:es)?|insects?|peas?\s+meme|green\s+peas?|classical\s+paintings?|oil\s+paintings?|renaissance\s+(?:art|painting|portrait)|baroque\s+painting|museum\s+painting|rembrandt|van\s+gogh|monet|literary\s+festival|book\s+festival|writers?\s+festival|brattleboro|(?:covid|c[\s-]?19|coronavirus)\s+(?:propaganda|psa|misinfo|hoax)|pandemic\s+propaganda|propaganda\s+war|sleepy\s+joe|antibody\s+dependent\s+enhancement|coursera|stanford\s+online|course\s+trailer|lecture\s+slides?|powerpoint\s+lecture|online\s+lecture|mooc(?:\s+lecture)?|title\s+card|capitol(?:\s+building)?|state\s+capitol|protest(?:ers?|ing)?|rally\s+(?:crowd|footage)|political\s+rally|maternity(?:\s+(?:ward|hospital|film|footage|clinic|care|1937|archival|vintage))?|childbirth|child\s*birth|washing\s+breasts?|kapparot|kapores|atonement\s+(?:ritual|ceremony)|ritual\s+(?:chicken|slaughter|atonement|kapparot)|news\s+talking\s*heads?|talking\s*heads?\s+(?:studio|news|interview)|news\s+(?:anchor|studio|desk)|anchor\s+desk|studio\s+(?:interview|talking)|newsroom\s+anchor|christmas\s+tree|xmas\s+tree|green\s+screen|holiday\s+backdrop|chroma\s+key|def\s*con|biohacking\s+village|madness\s+and\s+medicine|sex\s+after\s+(?:prostate|surgery)|prostate\s+(?:cancer\s+)?(?:sex|breaking\s+news)|christmas\s+tree|green\s*screen\s+(?:christmas|holiday)|legos?|mgtow|hiroshima|atomic\s+bomb|warzone|war\s*zone|holiday\s+health\s+tips|terrible\s+nurses|cnn\s*10|breast\s+implants?|plastic\s+surg(?:ery|eon)?|aesthetics?\s+(?:spa|medical)|mathew\s+epps|lowcountry\s+lowdown|cong\s+hoa|saigon|burn\s+ward|vietnam(?:ese)?\s+(?:war|hospital|archival|medical)|penfield\s+reading|ltc\s+lakin|obama.?s?\s+eligibility|challenging\s+obama|scooter\s+vs\s+car|collision\s+in\s+venice|medical\s+city\s+arlington|adventure\s+eight|paging\s+dr\.?\s+ross|scottsdale.?s?\s+cure\s+corridor|city\s+of\s+scottsdale|deadly\s+medicine\s+interactions|amazon\s+pharmacy|garland\s+isd|school\s+district|classroom\s+(?:demo|presentation)|students?\s+watching|children\s+(?:seated|audience)|kids?\s+(?:classroom|assembly)|robotic\s+surgery\s+demo\s+(?:at\s+)?(?:school|isd)|da\s*vinci\s+surgical\s+system\s+overview|neuralink\s+robot|school\s+nurse|wendy\s+cummings|whhi(?:\s+news)?|al\s+funduq|curfew\s+doctor|ukraine\s+pow|prisoners?\s+of\s+war|kissing\s+and\s+love|rhino\s+(?:ct|scan)|zoo\s+(?:ct|scan|x[\s-]?ray)|circumc(?:ision|ure)|board\s+of\s+commissioners|organ\s+harvesting|brain\s+death|world\s+laparoscopy\s+hospital|anniversary\s+celebration|medical\s+career|well\s+paying\s+medical|allied\s+health\s+radiologic|hospitals?\s+safe\s+from\s+covid|second\s+opinion\s+project|exhibition\s+hall|trade\s*show\s+floor|conference\s+(?:booth|floor|expo\s+floor)|expo\s+(?:floor|booth|hall)|himss\s+(?:conference|expo|show)|ces\s+(?:20\d{2}|conference|show)|health\s+(?:it\s+)?summit\s+(?:booth|floor|expo)|ai\s+(?:summit|conference)\s+(?:booth|floor|hall|product\s+demo)|medical\s+trade\s+show|healthcare\s+(?:expo|trade\s+show)|suit\s+(?:walk(?:ing)?|stroll(?:ing)?)|judy\s+mikovits|censored\s+scientists|david\s+samadi|truth\s+about\s+canadian\s+healthcare|medical\s+liability|healthloop|bad\s+patient\s+diagnoses|overwhelmed\s+covid|covid\s*19\s+ward|talk\s+of\s+the\s+town|whhitv|white\s+coat\s+ceremony|medical\s+school\s+(?:graduation|convocation|white\s+coat)|nursing\s+(?:pinning\s+ceremony|graduation\s+ceremony|celebration\s+day)|hospital\s+(?:fundraiser|benefit\s+gala|benefit\s+concert|anniversary\s+gala)|digital\s+health\s+(?:summit\s+(?:floor|booth|expo)|conference\s+(?:floor|booth|expo))|health\s+(?:tech|information\s+technology)\s+conference\s+(?:floor|booth|expo|keynote)|ehr\s+(?:demo|product\s+demo|software\s+demo|keynote)|emr\s+(?:demo|product\s+demo|software\s+demo))\b|\bexposed\s*[:\-]|\bmeme\b[^.]{0,40}\bpeas?\b/i;

/** Reason string when healthcare harvest media is conspiracy/disaster/meme junk. */
export function healthcareOffTopicBrollReason(haystack, contextText = '') {
  if (!isHealthcareTopic(contextText)) return '';
  const h = String(haystack || '');
  // Giphy pads dominate keyless healthcare pools as cartoon/meme motion with
  // empty titles (healthcare-web2: 9/17 assets) — hard-reject by host.
  if (/giphy\.com|media\d*\.giphy\.com/i.test(h)) {
    return 'healthcare off-topic giphy/cartoon B-roll';
  }
  if (HEALTHCARE_OFF_TOPIC_BROLL_RE.test(h)) {
    return 'healthcare off-topic conspiracy/disaster/meme B-roll';
  }
  return '';
}

/** Street-barber / random lifestyle clips that read as off-topic on investigation topics. */
export const RANDOM_LIFESTYLE_FILLER_RE =
  /\b(street barber|barber shop|haircut street|musician busking|concert crowd phone|stadium crowd|sports crowd|cheering fans|food truck|coffee shop latte|band playing|orchestra playing|jazz band|live band|musicians on stage)\b/i;

/** Generic lab/science B-roll loops on non-science topics. */
export const SCIENCE_LAB_LOOP_RE =
  /\b(lab technician pipette|microscope close up generic|scientist in lab coat walking|laboratory b-?roll|test tube rack generic)\b/i;

/** Ultrasound / medical stock on non-health topics. */
export const OFF_TOPIC_MEDICAL_STOCK_RE =
  /\b(ultrasound monitor|ultrasound screen|pregnancy ultrasound|fetal ultrasound|hospital corridor empty)\b/i;

/** Ferry/port timelapse filler on unrelated infrastructure stories. */
export const PORT_FERRY_LOOP_RE =
  /\b(ferry timelapse|port crane timelapse|container ship aerial generic|cargo ship sunset timelapse)\b/i;

/** Repeated camera/phone B-roll loops on non-surveillance topics. */
export const CAMERA_PHONE_LOOP_RE =
  /\b(person filming with phone|filming with smartphone|holding phone recording|camera on tripod generic|dslr camera close up)\b/i;

/**
 * Medical clickbait thumbnails ("HIDDEN CAUSE OF 60% DEATHS", "doctors don't want
 * you to know") — YouTube-style hook art scraped as if it were documentary B-roll.
 */
export const MEDICAL_CLICKBAIT_DEATH_STAT_RE =
  /\b\d{1,3}\s*(?:%|percent)\s*(?:of\s+)?(?:all\s+)?(?:deaths?|mortality|fatalities|patients?|cases?)\b|\b(?:deaths?|dying|mortality|fatalities)\b[^.]{0,24}?\b\d{1,3}\s*(?:%|percent)/i;

export const MEDICAL_CLICKBAIT_HOOK_RE =
  /\b(?:hidden|secret|shocking|real|true|leading|number\s*(?:one|1)|no\.?\s*1|#\s*1)\s+(?:cause|causes|reason|killer)\b|\bsilent\s+killer\b|\bdoctors?\s+(?:don'?t|do\s+not|won'?t|will\s+not|never)\s+(?:want\s+you\s+to\s+)?(?:know|tell|say)\b|\bwhat\s+(?:doctors?|hospitals?)\s+(?:aren'?t|are\s+not|won'?t)\s+(?:telling|tell)\b|\bthis\s+(?:is\s+)?(?:killing|kills)\s+(?:you|millions|thousands)\b/i;

/** Clickbait art only reads as "medical" when death/illness vocabulary is present. */
export const MEDICAL_CLICKBAIT_CONTEXT_RE =
  /\b(deaths?|dying|mortality|fatalities|hospitals?|patients?|doctors?|nurses?|clinic|medical|medicine|disease|diseases|cancer|stroke|heart\s+attack|diabetes|blood[\s-]?pressure|hypertension|symptoms?|diagnosis|surgery|icu)\b/i;

const MEDICAL_CLICKBAIT_ANY_RE = new RegExp(
  `${MEDICAL_CLICKBAIT_DEATH_STAT_RE.source}|${MEDICAL_CLICKBAIT_HOOK_RE.source}`,
  'i',
);

/**
 * @param {string} haystack
 * @param {string} [contextText]
 * @returns {string|null}
 */
export function medicalClickbaitReason(haystack, contextText = '') {
  const h = String(haystack || '');
  if (!h.trim()) return null;
  const ctx = String(contextText || '');
  // Health investigations may legitimately harvest mortality framing; other stories may not.
  if (isHealthcareTopic(ctx)) return null;
  if (!MEDICAL_CLICKBAIT_CONTEXT_RE.test(h)) return null;
  if (MEDICAL_CLICKBAIT_DEATH_STAT_RE.test(h)) return 'medical death-stat clickbait thumbnail';
  if (MEDICAL_CLICKBAIT_HOOK_RE.test(h)) return 'medical clickbait thumbnail';
  return null;
}

/** Hospital/ICU stock on a civil-aviation story (oxygen *masks* stay allowed). */
export const AIRLINE_MEDICAL_STOCK_RE =
  /\b(hospitals?|hospital\s+(?:bed|corridor|room|ward)|patients?|icu|intensive\s*care|nurses?|nursing\s*station|doctors?|surgeons?|surgery|operating\s*room|ambulances?|stretcher|paramedics?|iv\s*drip|infusion|ventilator|defibrillator|nasal\s*cannula|heart\s*monitor|ecg|ekg|blood[\s-]?pressure|hypertension|clinic|medical\s*(?:team|staff|equipment|monitor|attention)|oxygen\s*(?:tank|cylinder|therapy|concentrator)|msn\.com\/[^?\s]*\/health)\b/i;

/** Medical-aviation stories (medevac / air ambulance) legitimately mix the two. */
const MEDICAL_AVIATION_TOPIC_RE =
  /\b(medevac|air\s*ambulance|medical\s*(?:flight|evacuation|transport)|patient\s*transfer\s*flight)\b/i;

/**
 * Warships and military aviation are not civil-cabin B-roll. An aircraft carrier
 * reads as "aviation" to every keyword gate ("aircraft", "flight deck", "runway"),
 * so it has to be rejected before those tokens are scored.
 */
export const MILITARY_NAVAL_VISUAL_RE = new RegExp(
  [
    '\\baircraft\\s*carriers?\\b',
    '\\bcarrier\\s*(?:deck|strike\\s*group|air\\s*wing|landing)\\b',
    '\\b(?:war|battle)ships?\\b',
    '\\bnaval\\b',
    '\\bnavy\\b(?![-\\s]*blue)',
    '\\bu\\.?s\\.?s\\.?\\s+[a-z]{3,}',
    '\\b(?:frigate|destroyer|corvette|submarine)s?\\b',
    '\\b(?:fighter\\s*jets?|jet\\s*fighters?|warplanes?|gunships?)\\b',
    '\\bf\\/?a[-\\s]?18\\b',
    '\\bf[-\\s]?(?:1[4-8]|2[12]|35)\\b',
    '\\bmig[-\\s]?\\d+\\b',
    '\\bair\\s*force\\s*(?:base|one|jet|plane|aircraft|cargo)\\b',
    '\\bmilitary\\s*(?:aircraft|jets?|planes?|helicopter|transport|airfield|base|cargo)\\b',
    '\\bmarine\\s*corps\\b',
    '\\barmy\\s*aviation\\b',
    '\\bmissile\\s*launch\\b',
    '\\bcatapult\\s*launch\\b',
  ].join('|'),
  'i',
);

export const MILITARY_TOPIC_RE =
  /\b(military|navy|naval|army|air\s*force|marine\s*corps|warship|warplane|aircraft\s*carrier|combat|wartime|squadron|pentagon|defen[cs]e\s*(?:department|ministry)|fighter\s*jet|troops?|soldiers?)\b/i;

/**
 * @param {string} haystack
 * @param {string} [contextText]
 * @returns {string|null}
 */
export function militaryNavalJunkReason(haystack, contextText = '') {
  const h = String(haystack || '');
  if (!h.trim()) return null;
  if (MILITARY_TOPIC_RE.test(String(contextText || ''))) return null;
  if (!MILITARY_NAVAL_VISUAL_RE.test(h)) return null;
  return 'military/naval footage on a civil story';
}

/** Burned-in tickers and non-Latin captions fight our own overlays and read as scraped news. */
export const FOREIGN_NEWS_TICKER_RE =
  /\b(?:japanese|chinese|korean|arabic|thai|hindi|russian|cyrillic|hebrew|vietnamese|turkish)\s+(?:news|tv|television|broadcast|subtitles?|captions?|characters?|text|ticker|headlines?)\b|\bnews\s+(?:ticker|crawl)\b|\bticker\s+tape\s+news\b|\bscrolling\s+(?:headline|headlines|news|text|ticker)\b|\bchyron\b|\bburn(?:ed|t)[-\s]?in\s+(?:subtitles?|captions?|text)\b|\bforeign[-\s]language\s+(?:news|subtitles?|captions?|text)\b|\bunreadable\s+(?:text|overlay|caption|subtitles?)\b|\b(?:nhk|cgtn)\b/i;

/** CJK / Cyrillic / Arabic / Thai glyphs in alt or title. */
export const NON_LATIN_OVERLAY_SCRIPT_RE =
  /[\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

/**
 * @param {string} haystack
 * @param {string} [contextText]
 * @returns {string|null}
 */
export function unreadableOverlayReason(haystack, contextText = '') {
  const h = String(haystack || '');
  if (!h.trim()) return null;
  const ctx = String(contextText || '');
  if (NON_LATIN_OVERLAY_SCRIPT_RE.test(h) && !NON_LATIN_OVERLAY_SCRIPT_RE.test(ctx)) {
    return 'non-Latin news overlay text';
  }
  if (FOREIGN_NEWS_TICKER_RE.test(h) && !FOREIGN_NEWS_TICKER_RE.test(ctx)) {
    return 'foreign/unreadable news ticker overlay';
  }
  return null;
}

/** Monochrome stock unless the topic explicitly asks for it. */
export const MONOCHROME_STOCK_RE =
  /\b(black[\s-]+and[\s-]+white|b\s*[&/]\s*w|monochrome|gr[ae]yscale)\b/i;

/** Airline life-vest demos read as overused safety-card filler. */
export const AIRLINE_SAFETY_DEMO_STOCK_RE =
  /\b(life\s*(?:vest|jacket)\s*(?:demo|demonstration|safety|instruction|tutorial)|safety\s+demonstration\s+(?:vest|life\s*(?:vest|jacket))|flight\s+attendants?\s+(?:wearing\s+)?life\s*(?:vest|jacket)|life\s*(?:vest|jacket).{0,40}(?:flight\s+attendant|cabin\s+crew|safety\s+demo))\b/i;

/** Metadata that admits generated/warped people or gibberish icons. */
export const AI_LOOKING_STOCK_RE =
  /\b(ai[\s-]?(?:generated|looking)|generated\s+by\s+ai|synthetic\s+(?:face|faces|person|people|human|humans)|uncanny\s+valley|deepfake[\s-]?(?:ish|style|looking)|melted\s+faces?|warped\s+faces?|distorted\s+faces?|deformed\s+faces?|gibberish\s+(?:vest\s+)?(?:icon|icons|text|logo|patch|symbols?)|nonsense\s+(?:text|logo|icon|icons|patch|symbols?)|fake\s+(?:face|faces|human|person|people))\b/i;

/** Overused COVID masked passenger loops outside COVID stories. */
export const COVID_MASKED_CABIN_COUPLE_RE =
  /\b(?=.*\b(covid(?:-?19)?|coronavirus|pandemic)\b)(?=.*\bmask(?:ed|s|ing)?\b)(?=.*\b(?:airplane|aircraft|plane|flight|cabin)\b)(?=.*\b(?:couple|passengers?|travellers?|travelers?)\b).+/i;

/** Dark airplane-window vignettes that usually become dead opener stock. */
export const AIRPLANE_CABIN_WINDOW_RE =
  /\b((?:airplane|aircraft|plane|flight|cabin)\s+window|window\s+(?:seat|view).{0,80}(?:airplane|aircraft|plane|flight|cabin)|(?:airplane|aircraft|plane|flight|cabin).{0,80}window\s+(?:seat|view)?)\b/i;

export const DARK_WINDOW_TONE_RE =
  /\b(night|dark|silhouette|black|shadowy|dim(?:ly)? lit|low light)\b/i;

/** Airline paperwork that is explicitly aviation/safety related, not generic desk stock. */
export const AIRLINE_DOCUMENT_EVIDENCE_RE =
  /\b(faa|f\.a\.a\.|ntsb|n\.t\.s\.b\.|aviation|aircraft|airplane|aeroplane|airline|flight|cockpit|cabin(?:[-\s]?pressure)?|oxygen\s*mask|pressure\s*gauge|cabin\s+pressure\s+gauge|maintenance\s+log|aircraft\s+maintenance|aviation\s+maintenance|airworthiness|safety\s+report|incident\s+report|pilot|flight\s+attendant|hangar|tarmac|runway)\b/i;

/** Mail and paperwork pads that routinely masquerade as airline investigation B-roll. */
export const AIRLINE_MAIL_PAPERWORK_RE =
  /\b(u\.?\s*s\.?\s*mail|usps|postal[-\s]+service|post(?:al)?[-\s]+office(?:[-\s]+box)?|p\.?\s*o\.?\s*box|mail[-\s]*box(?:es)?|mailbox(?:es)?|blue[-\s]+mailbox|letter[-\s]*box(?:es)?)\b/i;

export const AIRLINE_MAGNIFYING_DOCUMENTS_RE =
  /\b(?:magnifying[-\s]+glass|loupe)\b.{0,90}\b(documents?|paperwork|papers?|reports?|contracts?|files?|forms?|invoices?|financial|desk)\b|\b(documents?|paperwork|papers?|reports?|contracts?|files?|forms?|invoices?|financial|desk)\b.{0,90}\b(?:magnifying[-\s]+glass|loupe)\b/i;

export const AIRLINE_FINANCIAL_PAPERWORK_RE =
  /\b(financial\s+reports?|finance\s+reports?|financial\s+report\s+pads?|stock\s+(?:chart|charts|market\s+chart|market\s+charts|market\s+graph|market\s+graphs)|stock-chart|accounting\s+desk|accountant\s+desk|accounting\s+paperwork|balance\s+sheet|income\s+statement|profit\s+and\s+loss|p\s*&\s*l\s+statement|ledger|tax\s+forms?|invoice\s+paperwork|business\s+report\s+charts?|financial\s+(?:chart|charts|graph|graphs)|market\s+analysis\s+paperwork|calculator.{0,30}(?:paperwork|financial|reports?))\b/i;

export const AIRLINE_GENERIC_DESK_PAPERWORK_RE =
  /(?=.*\b(desk|desktop|office\s+table|tabletop|conference\s+table|clipboard|legal\s+pad|notepad)\b)(?=.*\b(paperwork|documents?|papers?|reports?|forms?|folders?|files?|contracts?|invoices?|spreadsheets?|charts?|report\s+pads?)\b).+/i;

function airlineOffBrandJunkReason(haystack, contextText) {
  if (!isAirlineTopic(contextText)) return null;
  if (MEDICAL_AVIATION_TOPIC_RE.test(contextText)) return null;
  if (AIRLINE_MEDICAL_STOCK_RE.test(haystack)) return 'hospital/medical stock for airline';
  return null;
}

function airlinePaperworkJunkReason(haystack, contextText) {
  if (!isAirlineTopic(contextText)) return null;
  if (AIRLINE_MAIL_PAPERWORK_RE.test(haystack)) return 'generic mail/postal stock for airline';
  if (AIRLINE_MAGNIFYING_DOCUMENTS_RE.test(haystack)) return 'generic magnifying-glass document stock for airline';
  if (AIRLINE_FINANCIAL_PAPERWORK_RE.test(haystack)) return 'generic financial/report paperwork for airline';
  if (AIRLINE_DOCUMENT_EVIDENCE_RE.test(haystack)) return null;
  if (AIRLINE_GENERIC_DESK_PAPERWORK_RE.test(haystack)) return 'generic desk paperwork for airline';
  return null;
}

/** Wildfire / grid-failure news art scraped via "hidden failures" queries. */
export const AIRLINE_WILDFIRE_GRID_JUNK_RE =
  /\b(wildfires?|forest\s*fires?|deadly\s*fires?|grid\s*failures?|electrical\s*faults?|power\s*grid|solar\s*farms?|solar\s*panels?|photovoltaic|solar\s*(?:arrays?|cells?|energy|power(?:\s*plants?)?|installations?|rooftops?)|rooftop\s*solar)\b/i;

/** Tech-giant clickbait and logo pads. */
export const AIRLINE_TECH_CLICKBAIT_JUNK_RE =
  /\b((?:it\s*)?giant\s+google|google\s+logo|terminated\s+projects?|must\s+watch\s+failures?|failures?\s+hidden\s+in\s+success|tech\s+giant)\b/i;

/** Booking / how-to-fly promo stills (not investigation B-roll). */
export const AIRLINE_BOOKING_PROMO_JUNK_RE =
  /\b(how\s+to\s+book|book\s+(?:airline\s+)?flight\s+tickets?|flight\s+tickets?\s+promo|cheap\s+flights?\s+deal|book\s+allegiant|allegiant\s+airline\s+flight)\b/i;

/** Physics homework / game / spacecraft that share the word "pressure". */
export const AIRLINE_FALSE_PRESSURE_JUNK_RE =
  /\b(ideal\s+(?:diatomic\s+)?gas|diatomic\s+gas|calculate\s+the\s+final\s+pressure|textbook\s+(?:page|diagram|problem)|homework\s+diagram|filo-question|searchlights?\s+in\s+pressure|beat\s+the\s+new\s+final|roblox|orion\s+pressure\s+vessel|pressure\s+vessel\s+weld|spacecraft|space\s*capsule)\b/i;

/** SAF / solar-kerosene marketing on a cabin-pressure investigation. */
export const AIRLINE_SOLAR_FUEL_PROMO_RE =
  /\b(solar\s+kerosene|fuel\s+made\s+from\s+sunlight|sustainable\s+aviation\s+fuels?|\be-?saf\b|\bsaf\b|sunlight.{0,40}airline|airline.{0,40}solar\s+fuel|solar\s+jet\s+fuel|sun[-\s]?to[-\s]?liquid|power[-\s]?to[-\s]?liquid|\bptl\s+fuels?\b|synthetic\s+(?:jet\s+)?fuels?|synfuels?|e[-\s]?fuels?|green\s+(?:jet\s+)?fuels?|carbon[-\s]?neutral\s+(?:jet\s+)?fuels?|bio[-\s]?jet\s+fuels?|aviation\s+biofuels?|solar\s+(?:reactor|refinery|fuel\s+plant)|synhelion)\b/i;

/** Topics genuinely about SAF/solar fuel (exempt from the promo gate). */
const AIRLINE_SOLAR_FUEL_TOPIC_RE =
  /\b(solar\s*kerosene|sustainable\s+aviation|saf|sunlight\s+fuel|e-?fuel|synthetic\s+fuel|biofuel)\b/i;

/** YouTube Shorts / viral clickbait packaging. */
export const VIRAL_SHORTS_CLICKBAIT_RE =
  /\b#\s*shorts\b|\b#\s*viral\b|\bmust\s+watch\b|\b(?:youtube\s+)?shorts?\b.{0,40}\b(?:viral|trending)\b/i;

/** Political / budget pads that hitch a ride on airport/tarmac keywords. */
export const AIRLINE_POLITICS_PAD_RE =
  /\b(clinton\s+lynch|budget\s+20\d{2}|what\s+budget\s+means|tarmac\s+meeting|judicial\s+watch)\b/i;

/** Slide decks / SaaS pitch walls — retention killers when scraped as B-roll. */
export const CORPORATE_SLIDE_DECK_JUNK_RE =
  /\b(slideshare|slide\s*share|pitch\s*deck|powerpoint|keynote\s*slide|findability\s*sciences|corporate\s*slide|saas\s*slide)\b|slidesharecdn\.com/i;

/**
 * Off-topic scrapes that survive keyword overlap on cabin-pressure topics
 * ("pressure", "failures", "hidden").
 *
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
export function airlineHarvestJunkReason(haystack, contextText = '') {
  if (!isAirlineTopic(contextText)) return null;
  const h = String(haystack || '');
  if (!h.trim()) return null;
  const ctx = String(contextText || '');
  if (AIRLINE_WILDFIRE_GRID_JUNK_RE.test(h) && !/\b(wildfire|forest\s*fire|grid\s*failure|solar\s*farm)\b/i.test(ctx)) {
    return 'wildfire/grid/solar-farm stock for airline';
  }
  if (AIRLINE_TECH_CLICKBAIT_JUNK_RE.test(h) && !/\b(google|tech\s*giant|silicon\s*valley)\b/i.test(ctx)) {
    return 'tech-giant clickbait for airline';
  }
  if (AIRLINE_BOOKING_PROMO_JUNK_RE.test(h)) {
    return 'airline booking/promo still';
  }
  if (AIRLINE_FALSE_PRESSURE_JUNK_RE.test(h)) {
    return 'false-pressure (game/physics/spacecraft) stock';
  }
  if (AIRLINE_SOLAR_FUEL_PROMO_RE.test(h) && !AIRLINE_SOLAR_FUEL_TOPIC_RE.test(ctx)) {
    return 'solar-fuel/SAF promo for cabin-pressure story';
  }
  if (VIRAL_SHORTS_CLICKBAIT_RE.test(h)) {
    return 'viral shorts clickbait packaging';
  }
  if (AIRLINE_POLITICS_PAD_RE.test(h) && !/\b(clinton|lynch|budget|congress|election)\b/i.test(ctx)) {
    return 'politics/budget pad for airline';
  }
  if (CORPORATE_SLIDE_DECK_JUNK_RE.test(h)) {
    return 'corporate slide deck for airline';
  }
  return null;
}

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
export function genericStockJunkReason(haystack, contextText = '') {
  const h = String(haystack || '');
  const ctx = String(contextText || '').toLowerCase();
  if (!h.trim()) return null;

  if (FOUND_FOOTAGE_AESTHETIC_RE.test(h)) return 'grainy/found-footage stock';
  if (FILM_STRIP_GRAPHIC_RE.test(h) && !FILM_TOPIC_CONTEXT_RE.test(ctx)) {
    return 'film-strip/reel graphic wrapper';
  }
  if (BLURRY_LOW_QUALITY_RE.test(h)) return 'blurry/low-quality stock';
  if (OVEREXPOSED_STOCK_RE.test(h)) return 'overexposed/washed-out stock';
  if (AI_LOOKING_STOCK_RE.test(h)) return 'AI-looking/deepfake-ish stock';
  const clickbait = medicalClickbaitReason(h, ctx);
  if (clickbait) return clickbait;
  const militaryNaval = militaryNavalJunkReason(h, ctx);
  if (militaryNaval) return militaryNaval;
  const unreadableOverlay = unreadableOverlayReason(h, ctx);
  if (unreadableOverlay) return unreadableOverlay;
  const airlineOffBrand = airlineOffBrandJunkReason(h, ctx);
  if (airlineOffBrand) return airlineOffBrand;
  if (AIRLINE_SAFETY_DEMO_STOCK_RE.test(h)) return 'generic life-vest/safety-demo stock';
  if (AIRPLANE_CABIN_WINDOW_RE.test(h) && DARK_WINDOW_TONE_RE.test(h)) {
    return 'dark airplane/cabin-window stock';
  }
  const airlinePaperworkJunk = airlinePaperworkJunkReason(h, ctx);
  if (airlinePaperworkJunk) return airlinePaperworkJunk;
  const airlineHarvestJunk = airlineHarvestJunkReason(h, ctx);
  if (airlineHarvestJunk) return airlineHarvestJunk;
  if (MONOCHROME_STOCK_RE.test(h) && !MONOCHROME_STOCK_RE.test(ctx)) {
    return 'black-and-white/monochrome stock';
  }
  if (COVID_MASKED_CABIN_COUPLE_RE.test(h) && !isCovidTopic(ctx)) {
    return 'overused COVID masked airplane-cabin passenger stock';
  }
  if (STAGED_REENACT_RE.test(h) && !/\b(staged|reenact)/i.test(ctx)) {
    return 'staged reenactment stock';
  }
  if (
    PRODUCE_GROCERY_JUNK_RE.test(h)
    && !/\bfood|poison|salmonella|grocery|produce|nutrition|diet|e\.?\s*coli|restaurant\b/i.test(ctx)
  ) {
    return 'off-topic produce/grocery stock';
  }
  if (
    EMPTY_HOSPITAL_BED_RE.test(h)
    && !/\b(patient|nurse|doctor|caregiver|family|elderly|visiting)\b/i.test(h)
  ) {
    return 'empty/blurry hospital bed filler';
  }
  if (isNursingHomeTopic(ctx)) {
    if (GENERIC_CORPORATE_FILLER_RE.test(h)) return 'off-topic corporate/architecture for nursing';
    if (PRODUCE_GROCERY_JUNK_RE.test(h)) return 'off-topic produce/grocery for nursing';
    if (
      EMPTY_HOSPITAL_BED_RE.test(h)
      && !/\b(patient|caregiver|elderly|family|nurse)\b/i.test(h)
    ) {
      return 'empty/blurry hospital bed for nursing';
    }
  }
  if (GENERIC_CORPORATE_FILLER_RE.test(h) && !isWorkplaceTopic(ctx)) {
    return 'generic corporate/architecture filler';
  }
  if (
    PRESS_MIC_PODCAST_FILLER_RE.test(h)
    && !/\b(podcast|radio|interview|microphone|broadcast|asmr|studio)\b/i.test(ctx)
  ) {
    return 'generic press/mic/podcast filler';
  }
  if (isHousingTopic(ctx) && HOUSING_STOCK_LOOP_RE.test(h) && !/\b(eviction notice|court|lease|landlord|tenant|letter|keys)\b/i.test(h)) {
    return 'generic housing/moving-box loop stock';
  }
  const housingOffTopic = housingOffTopicBrollReason(h, ctx);
  if (housingOffTopic) return housingOffTopic;
  const healthcareOffTopic = healthcareOffTopicBrollReason(h, ctx);
  if (healthcareOffTopic) return healthcareOffTopic;
  if (
    RANDOM_LIFESTYLE_FILLER_RE.test(h)
    && !/\b(concert|ticket|scalp|music festival|barber)\b/i.test(ctx)
  ) {
    return 'random lifestyle filler';
  }
  if (
    CAMCORDER_STOCK_LOOP_RE.test(h)
    && !/\b(cctv|surveillance|security camera|nursing home|abuse|recorded)\b/i.test(ctx)
  ) {
    return 'generic camcorder/camera-holding loop';
  }
  if (
    SCIENCE_LAB_LOOP_RE.test(h)
    && !/\b(lab|science|research|biology|chemistry|physics|experiment|study)\b/i.test(ctx)
    && !isHealthcareTopic(ctx)
  ) {
    // AI / hospital stories legitimately use medical-research lab B-roll.
    return 'generic science lab loop';
  }
  if (
    PORT_FERRY_LOOP_RE.test(h)
    && !/\b(port|ferry|shipping|maritime|cargo|container|dock|freight)\b/i.test(ctx)
  ) {
    return 'generic port/ferry timelapse';
  }
  if (
    OFF_TOPIC_MEDICAL_STOCK_RE.test(h)
    && !/\b(patient|doctor|nurse|hospital|healthcare|pregnancy|clinic|medical)\b/i.test(ctx)
  ) {
    return 'off-topic medical/ultrasound stock';
  }
  if (
    CAMERA_PHONE_LOOP_RE.test(h)
    && !/\b(cctv|surveillance|podcast|recording studio)\b/i.test(ctx)
  ) {
    // Query text alone ("documentary") is not enough to exempt camcorder junk.
    return 'generic camera/phone filming loop';
  }
  return null;
}

/** @param {string} haystack @param {string} [contextText] */
export function isGenericStockJunk(haystack, contextText = '') {
  return Boolean(genericStockJunkReason(String(haystack || ''), String(contextText || '')));
}

/**
 * @param {string} haystack
 * @param {string} contextText
 * @returns {string|null}
 */
function offTopicBlockReason(haystack, contextText) {
  for (const rule of OFF_TOPIC_BLOCKLIST) {
    if (rule.pattern.test(haystack) && !rule.requires.test(contextText)) {
      return `blocklist: ${rule.pattern}`;
    }
  }
  if (OFF_BRAND_VISUAL_RE.test(haystack) && !OFF_BRAND_VISUAL_RE.test(contextText)) {
    return 'off-brand visual (puppet/cartoon/insect)';
  }
  const junk = genericStockJunkReason(haystack, contextText);
  if (junk) return junk;
  return null;
}

/** @param {string} haystack @param {string} [contextText] */
export function isOffBrandVisual(haystack, contextText = '') {
  return Boolean(offTopicBlockReason(String(haystack || ''), String(contextText || '')));
}

/** Crime/heist topics often harvest unevenly after relevance dedupe (e.g. diamond heist). */
export function isCrimeHeistTopic(topicBlob = '') {
  const t = String(topicBlob || '');
  return (
    isHeistTopic(t)
    || /\b(robbery|robbed|stolen|jewelry|thief|burglar|smuggl|trespass)\b/i.test(t)
  );
}

/**
 * @param {string} text
 * @param {number} [max]
 */
export function extractKeywords(text, max = 14) {
  const raw = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const seen = new Set();
  const out = [];
  for (const w of raw) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** Volume padding from top-up passes — must not be stripped by post-top-up relevance. */
export function isVolumePaddingAsset(asset) {
  if (isUnsafeMediaUrl(asset?.url || '')) return false;
  if (isJunkWebVolumeStillUrl(asset?.url || '')) return false;
  const blob = `${asset?.source || ''} ${asset?.query || ''} ${asset?.id || ''}`.toLowerCase();
  return /volume top-up|stock pool|stock-video|cyber-stock|stock video pool|topup-|stock-topup-/i.test(blob);
}

/** Synthetic harvest queries that never describe the media they fetched. */
const SYNTHETIC_QUERY_RE = /^(stock-video|stock-pool)\b/i;

const PROVIDER_ALT_PREFIX_RE =
  /^(?:pexels|pixabay|unsplash|archive\.org|mixkit|coverr)(?:\s+(?:video|photo|image|still))?\s*:\s*/i;
const PROVIDER_ALT_ONLY_RE =
  /^(?:pexels|pixabay|unsplash|archive\.org|mixkit|coverr)(?:\s+(?:video|photo|image|still))?$/i;

const CRIME_HEIST_EVIDENCE_RE =
  /airport|runway|terminal|vault|safe|security|diamond|jewel|cargo|guard|heist|plane|aviation|warehouse|investigation|documentary|news/i;
/**
 * Everyday aviation vocabulary. Real Bing/Google/DuckDuckGo/YouTube titles and
 * harvest queries rarely say the narrow "airplane cabin" phrasings the strict
 * strong-video regexes look for; they say plane/jet/airliner/airline/flight,
 * name the manufacturer (Boeing/Airbus/Embraer), or describe the event
 * (turbulence, pressurization, decompression, emergency landing). Keeping this
 * list broad is what lets web-native aviation clips clear the airline relevance
 * fallback and count as aviation-strong. It is only ever consulted on airline
 * topics (callers gate on isAirlineTopic), so the extra breadth is safe.
 */
const AIRLINE_AVIATION_EVIDENCE_RE =
  /\b(airplanes?|aeroplanes?|aircrafts?|airliners?|jetliners?|airlines?|aviation|jets?|planes?|cabin|cockpits?|flight\s*decks?|oxygen\s*masks?|hangars?|runways?|tarmac|taxiways?|boarding|jet\s*bridges?|jetways?|flight\s*attendants?|air\s*hostess(?:es)?|cabin\s*crew|fuselages?|airports?|boeing|airbus|embraer|bombardier|turbulence|pressuriz\w*|depressuriz\w*|decompress\w*|cabin\s*altitude|take-?offs?|in-?flight|mid-?air|emergency\s*landings?|flights?|flying)\b/i;

/**
 * Everyday hospital / clinical / AI-medicine vocabulary. Real Bing/Google/DDG
 * titles rarely say the exact query we searched; they say hospital, doctor,
 * nurse, MRI, radiology, diagnosis, EHR, telemedicine, etc. Callers gate on
 * isHealthcareTopic so the breadth stays on-topic.
 */
const HEALTHCARE_EVIDENCE_RE =
  /\b(hospitals?|clinics?|patients?|doctors?|physicians?|nurses?|surgeons?|surgery|surgical|icu|intensive\s*care|wards?|medical|medicine|healthcare|health\s*care|hipaa|ehr|emr|radiolog\w*|mri|ct\s*scan|ultrasound|diagnos\w*|stethoscope|ambulances?|paramedics?|stretchers?|iv\s*drip|ventilators?|defibrillators?|heart\s*monitors?|ecg|ekg|telemedicine|telehealth|medical\s*records?|exam\s*room|waiting\s*room|hospital\s*(?:corridor|hallway|ward|bed|room)|nurse\s*(?:station|workstation)|physician|oncolog\w*|cardiolog\w*|patholog\w*|ai\s*(?:in\s*)?(?:medicine|healthcare|diagnosis|radiology)|machine\s*learning\s*(?:in\s*)?(?:medicine|healthcare|diagnosis)|clinical\s*ai)\b/i;

/**
 * Everyday housing-market / tenant / eviction vocabulary. Abstract script
 * beats ("The Fear Factor", "Take Control Now") rarely share keywords with
 * real Bing/Archive titles (Zillow, eviction, landlord, apartment). Without
 * an evidence floor those segments starve → volume-topical-video-empty and
 * soft-pass never runs. Callers gate on isHousingTopic. Avoid bare
 * "home"/"house" (home-movie / war-footage false positives).
 */
const HOUSING_EVIDENCE_RE =
  /\b(housings?|apartments?|condo(?:minium)?s?|rentals?|landlords?|tenants?|evict(?:ion|ed|ing)?|foreclos\w*|mortgages?|leases?|lessees?|lessors?|rent(?:al|ers?)?|renters?|realtors?|real\s*estate|zillow|redfin|realtor\.com|for\s*rent|for\s*sale|housing\s*market|home\s*prices?|house\s*prices?|property\s*values?|affordable\s*housings?|section\s*8|public\s*housings?|eviction\s*notice|lease\s*agreement|rent\s*(?:hike|spike|crisis|control)|tenant\s*(?:rights?|union)|landlord[\s-]?tenant|moving\s*(?:truck|van)|packing\s*boxes|apartment\s*(?:building|interior|hallway|complex)|suburban\s*homes?|residential\s*(?:street|neighborhood|homes?))\b/i;


/**
 * Does an asset carry aviation evidence? Stock clips must prove it from the media
 * itself (alt/title/URL, never the search query). Web-native clips (raw web
 * harvest via Bing/Google/DuckDuckGo/`/api/download-clip`, Vimeo, Dailymotion,
 * Giphy, Archive.org) may additionally prove it from their real page title and
 * the deliberate harvest query — the same evidence contract used for archive
 * items — because the operator opted into web harvest being the primary supply.
 *
 * @param {object} asset
 * @returns {boolean}
 */
export function hasAirlineAviationEvidence(asset = {}) {
  if (AIRLINE_AVIATION_EVIDENCE_RE.test(visualEvidenceBlob(asset))) return true;
  if (isWebNativeMotionSource(asset) && AIRLINE_AVIATION_EVIDENCE_RE.test(webNativeEvidenceBlob(asset))) {
    return true;
  }
  return false;
}
/**
 * Healthcare evidence contract — same stock-vs-web split as aviation.
 * @param {object} asset
 * @returns {boolean}
 */
export function hasHealthcareEvidence(asset = {}) {
  if (HEALTHCARE_EVIDENCE_RE.test(visualEvidenceBlob(asset))) return true;
  if (isWebNativeMotionSource(asset) && HEALTHCARE_EVIDENCE_RE.test(webNativeEvidenceBlob(asset))) {
    return true;
  }
  return false;
}
/**
 * Housing evidence contract — same stock-vs-web split as aviation/healthcare.
 * @param {object} asset
 * @returns {boolean}
 */
export function hasHousingEvidence(asset = {}) {
  if (HOUSING_EVIDENCE_RE.test(visualEvidenceBlob(asset))) return true;
  if (isWebNativeMotionSource(asset) && HOUSING_EVIDENCE_RE.test(webNativeEvidenceBlob(asset))) {
    return true;
  }
  return false;
}


/** The search string an asset was fetched with (synthetic pool queries dropped). */
export function assetSearchQueryText(asset) {
  const query = String(asset?.query || '').trim();
  if (!query || SYNTHETIC_QUERY_RE.test(query)) return '';
  return query.toLowerCase();
}

/**
 * What the media itself claims to show. The query used to fetch an asset is
 * excluded on purpose: providers echo the search string back into `alt`, which
 * lets a football clip certify itself as "worried passenger face". Query text
 * may only strengthen an asset that already has visual evidence.
 *
 * @param {object} asset
 * @returns {string}
 */
export function visualEvidenceBlob(asset) {
  const rawAlt = String(asset?.alt || '').trim();
  const query = assetSearchQueryText(asset);
  let alt = PROVIDER_ALT_ONLY_RE.test(rawAlt)
    ? ''
    : rawAlt.replace(PROVIDER_ALT_PREFIX_RE, '').toLowerCase();
  if (alt && query) {
    alt = alt.split(query).join(' ');
  }
  return `${alt} ${asset?.title || ''} ${asset?.sourceUrl || ''} ${asset?.url || ''} ${asset?.thumbnailUrl || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object} asset
 * @param {object} segment
 * @param {string} topic
 * @param {string[]} topicKeywords
 */
export function scoreAssetRelevance(asset, segment, topic, topicKeywords = []) {
  const segText = `${segment?.title || ''} ${segment?.narration || ''}`;
  const segKeywords = extractKeywords(segText, 10).filter((kw) => {
    if (WEAK_TOPIC_WORDS.has(kw)) return false;
    if (isAirlineTopic(topic) && AIRLINE_AMBIGUOUS_TOPIC_WORDS.has(kw)) return false;
    return true;
  });
  const topicKws = topicKeywords.length ? topicKeywords : extractKeywords(topic, 12);
  const strongTopicKws = topicKws.filter((kw) => {
    if (WEAK_TOPIC_WORDS.has(kw)) return false;
    // "pressure"/"failures"/"hidden" alone must not certify physics games or wildfire news.
    if (isAirlineTopic(topic) && AIRLINE_AMBIGUOUS_TOPIC_WORDS.has(kw)) return false;
    return true;
  });
  const corpus = new Set([...strongTopicKws, ...segKeywords]);

  const visual = visualEvidenceBlob(asset);
  const queryForScore = assetSearchQueryText(asset);
  if (!visual) return 0;

  const contextText = `${topic} ${segText}`.toLowerCase();
  // Junk/off-brand gates still read the query: a fetch string that admits junk fails closed.
  if (offTopicBlockReason(`${visual} ${queryForScore}`.trim(), contextText)) return 0;

  const countHits = (keywords, text) => keywords.reduce((n, kw) => (text.includes(kw) ? n + 1 : n), 0);
  const visualTopicHits = countHits(strongTopicKws, visual);
  const visualSegHits = countHits(segKeywords, visual);
  const combined = queryForScore ? `${visual} ${queryForScore}` : visual;
  const topicHits = countHits(strongTopicKws, combined);
  const segHits = countHits(segKeywords, combined);

  // The query never establishes relevance on its own — the media must show something topical.
  if (visualTopicHits + visualSegHits === 0) {
    if (isCrimeHeistTopic(topic) && CRIME_HEIST_EVIDENCE_RE.test(visual)) return 0.35;
    if (isAirlineTopic(topic) && AIRLINE_AVIATION_EVIDENCE_RE.test(visual)) return 0.4;
    // "healthcare"/"AI" topic tokens rarely appear in hospital/doctor titles —
    // clinical evidence floors keep honest medical motion through the filter.
    if (isHealthcareTopic(topic) && hasHealthcareEvidence(asset)) return 0.4;
    // Abstract housing beats ("Fear Factor") share no keywords with Zillow /
    // eviction / apartment titles — evidence floors keep lived-in housing motion.
    if (isHousingTopic(topic) && hasHousingEvidence(asset)) return 0.4;
    return 0;
  }
  if (segHits === 0 && topicHits < 2) {
    if (isCrimeHeistTopic(topic) && CRIME_HEIST_EVIDENCE_RE.test(visual)) return 0.3;
    if (isAirlineTopic(topic) && AIRLINE_AVIATION_EVIDENCE_RE.test(visual)) return 0.35;
    if (isHealthcareTopic(topic) && hasHealthcareEvidence(asset)) return 0.35;
    if (isHousingTopic(topic) && hasHousingEvidence(asset)) return 0.35;
    return 0;
  }

  const denom = Math.min(Math.max(corpus.size, 1), 8);
  let score = (topicHits + segHits) / denom;

  if (asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(asset?.url || '')) {
    score += 0.05;
  }
  if (queryForScore && segKeywords.some((k) => queryForScore.includes(k))) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * @param {object[]} media
 * @param {object} project
 * @param {{ minScore?: number }} [options]
 */
export function filterAssetsByRelevance(media, project, options = {}) {
  const minScore = options.minScore ?? 0.25;
  const topic = project.topic || project.title || '';
  const topicKeywords = extractKeywords(topic, 12);
  const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
  const kept = [];
  const dropped = [];

  for (const asset of media) {
    const seg = segments[asset.segmentId] || project.script?.[0];
    const haystack = `${asset?.alt || ''} ${asset?.url || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''}`.toLowerCase();
    const contextText = `${topic} ${seg?.title || ''} ${seg?.narration || ''}`.toLowerCase();
    const blockReason = offTopicBlockReason(haystack, contextText);
    if (blockReason) {
      dropped.push({
        url: asset.url,
        segmentId: asset.segmentId,
        score: 0,
        reason: blockReason,
      });
      continue;
    }

    const score = scoreAssetRelevance(asset, seg, topic, topicKeywords);
    if (score >= minScore) {
      kept.push({ ...asset, relevanceScore: Math.round(score * 100) / 100 });
    } else if (isAirlineTopic(topic) && hasAirlineAviationEvidence(asset)) {
      // Keyword essay matching misses short aviation stock alts. Stock clips must
      // prove aviation from the media itself (alt/title), but web-native clips (raw
      // web harvest) may also prove it from their real page title and the deliberate
      // harvest query — parallel to Archive.org's evidence verdict — so a Bing/Google
      // "/api/download-clip" aviation clip is not discarded as off-topic.
      kept.push({ ...asset, relevanceScore: 0.35 });
    } else if (isHousingTopic(topic) && hasHousingEvidence(asset)) {
      // Parallel to airline: abstract housing beats drop keyword matches; keep
      // clips that prove apartment/eviction/rent/landlord evidence themselves.
      kept.push({ ...asset, relevanceScore: 0.35 });
    } else {
      dropped.push({
        url: asset.url,
        segmentId: asset.segmentId,
        score: Math.round(score * 100) / 100,
        reason: score === 0 ? 'no strong topic/segment keyword hits' : 'below relevance threshold',
      });
    }
  }

  return { media: kept, dropped, minScore };
}

/** Volume padding gets a discount on the relevance floor, never a bypass. */
export const VOLUME_PADDING_MIN_RELEVANCE = 0.2;

/**
 * Re-attach volume-padding assets dropped by relevance so per-segment counts hold.
 * @param {object[]} media
 * @param {object[]} padding
 */
export function mergeVolumePadding(media, padding, project = null) {
  let pad = padding || [];
  if (project && pad.length) {
    const topicBlob = `${project.topic || ''} ${project.title || ''}`;
    const topicKeywords = extractKeywords(topicBlob, 12);
    const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
    pad = pad.filter((asset) => {
      const blob = `${asset.alt || ''} ${asset.query || ''} ${asset.source || ''} ${asset.url || ''}`;
      if (isOffBrandVisual(blob, topicBlob)) return false;
      if (isGenericStockJunk(blob, topicBlob)) return false;
      // Padding must still be topical, or thin segments become a laundering channel
      // for off-topic media the relevance filter just dropped.
      const seg = segments[asset.segmentId] || project.script?.[0];
      return (
        scoreAssetRelevance(asset, seg, topicBlob, topicKeywords) >= VOLUME_PADDING_MIN_RELEVANCE
      );
    });
  }
  const out = [...media];
  for (const asset of pad) {
    const key = canonicalMediaKey(asset.url || '');
    if (!key) continue;
    if (out.some((m) => m.segmentId === asset.segmentId && canonicalMediaKey(m.url || '') === key)) continue;
    out.push(asset);
  }
  return out;
}

/** @param {object} asset */
function isVideoAsset(asset) {
  return asset?.type === 'video' || /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(asset?.url || '');
}

/**
 * Canonical dedup key for a media URL.
 *
 * Web-native motion is proxied through `/api/download-clip?url=<encoded target>&…`,
 * so a naive `split('?')[0]` collapses EVERY proxied web clip to the single key
 * `/api/download-clip`. That silently deduped a whole 16-clip web pool down to one
 * "unique video", which is why a web-rich airline harvest reported `0/1` videos and
 * failed the aviation-strong / thin floors. Key proxied clips by their decoded
 * target URL so distinct web clips stay distinct; everything else keeps the
 * query-stripped URL key.
 *
 * @param {string} url
 * @returns {string}
 */
export function canonicalMediaKey(url = '') {
  const raw = String(url || '');
  if (!raw) return '';
  if (raw.includes('/api/download-clip')) {
    try {
      const target = new URL(raw, 'http://autotube.local').searchParams.get('url');
      if (target) return `download-clip:${target.split('#')[0]}`;
    } catch {
      // Fall through to the generic key below.
    }
  }
  return raw.split('?')[0];
}

/** @param {object} asset */
function mediaAssetKey(asset) {
  return canonicalMediaKey(asset?.url || '');
}

/** Archive.org motion from the keyless harvest path (no stock API keys). */
const KEYLESS_ARCHIVE_SOURCE_RE = /archive\.org/i;

/**
 * Human portrait / reaction / close-up signals in archive metadata. Query text
 * is included because keyless archive items often ship without titles or alts.
 */
export const KEYLESS_ARCHIVE_HUMAN_VISUAL_RE =
  /\b(?:portrait|close[\s-]?up|closeup|reaction|worried|shocked|expression|faces?|eyes|crying|smiling|emotional)\b/i;

/** @param {object} asset */
function isKeylessArchiveAsset(asset) {
  const blob = `${asset?.source || ''} ${asset?.url || ''} ${asset?.sourceUrl || ''}`;
  return KEYLESS_ARCHIVE_SOURCE_RE.test(blob);
}

/**
 * @param {object} asset
 * @returns {string}
 */
export function keylessArchiveHumanVisualBlob(asset) {
  return `${asset?.alt || ''} ${asset?.query || ''} ${visualEvidenceBlob(asset)}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Floor score for keyless archive portrait/reaction clips that keyword scoring
 * misses but face-first edit timelines still need as topical video candidates.
 * Aviation B-roll keeps its higher airline evidence floor (0.35–0.4).
 *
 * @param {object} asset
 * @param {object} segment
 * @param {string} topicBlob
 */
export function keylessArchiveHumanPortraitScore(asset, segment, topicBlob) {
  if (!isVideoAsset(asset) || !isKeylessArchiveAsset(asset)) return 0;
  const contextText = `${topicBlob} ${segment?.title || ''} ${segment?.narration || ''}`.toLowerCase();
  const blob = keylessArchiveHumanVisualBlob(asset);
  if (!blob || !KEYLESS_ARCHIVE_HUMAN_VISUAL_RE.test(blob)) return 0;
  // Junk gates still win — never launder mailbox/hospital pads via a face query.
  if (offTopicBlockReason(`${blob} ${assetSearchQueryText(asset)}`.trim(), contextText)) return 0;
  return 0.25;
}

/**
 * Web-native motion sources — the PRIMARY harvest supply for this pipeline.
 *
 * Raw web harvest (search-engine video, social video hosts, scraper proxies and
 * Archive.org) is where motion comes from; Pexels/Pixabay stock APIs are an
 * optional nicety, not a requirement. A pool built from these sources is
 * first-class live motion, exactly like keyed stock video.
 */
export const WEB_NATIVE_MOTION_SOURCE_RE =
  /\b(?:bing|google|duck\s*duck\s*go|duckduckgo|ddg|startpage|vimeo|dailymotion|giphy|hybrid\s*scraper|hybrid|deep\s*harvest|deepharvest|archive\.org)\b/i;

/** URL fingerprints for web-native motion (our clip proxy + social/video hosts). */
export const WEB_NATIVE_MOTION_URL_RE =
  /\/api\/download-clip|(?:^|[./])vimeo(?:cdn)?\.com|(?:^|[./])dailymotion\.com|(?:^|[./])dmcdn\.net|(?:^|[./])giphy\.com|(?:^|[./])media\d*\.giphy\.com|(?:^|[./])archive\.org/i;

/**
 * Is this asset raw web-harvest motion (as opposed to Pexels/Pixabay stock)?
 * @param {object} asset
 */
export function isWebNativeMotionSource(asset = {}) {
  const source = String(asset?.source || '');
  const url = String(asset?.url || '');
  // Pexels/Pixabay stay classified as optional stock, never as web-native motion.
  if (/\bpexels\b|\bpixabay\b/i.test(`${source} ${url}`)) return false;
  return WEB_NATIVE_MOTION_SOURCE_RE.test(source) || WEB_NATIVE_MOTION_URL_RE.test(url);
}

/**
 * Evidence blob for web-native clips. Unlike stock providers (which echo the
 * search query back into `alt`), raw web search results carry real page titles,
 * and the operator has opted in to letting the harvest query itself count as a
 * signal. This is the web-clip parallel to Archive.org's evidence verdict.
 *
 * @param {object} asset
 * @returns {string}
 */
export function webNativeEvidenceBlob(asset = {}) {
  return `${asset?.alt || ''} ${asset?.title || ''} ${asset?.query || ''} ${asset?.sourceUrl || ''} ${asset?.url || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A segment-level relevance score for motion coverage. This deliberately uses
 * the same visual-evidence and junk gates as the harvest filter: query-only
 * matches, airline medical/carrier/ticker junk, and unsafe URLs cannot pad a
 * segment.
 *
 * @param {object} asset
 * @param {object} segment
 * @param {string} topicBlob
 * @param {string[]} topicKeywords
 */
function topicalVideoScore(asset, segment, topicBlob, topicKeywords) {
  if (!isVideoAsset(asset)) return 0;
  if (isUnsafeMediaUrl(asset?.url || '') || isJunkWebVolumeStillUrl(asset?.url || '')) return 0;
  const base = scoreAssetRelevance(asset, segment, topicBlob, topicKeywords);
  const portraitFloor = keylessArchiveHumanPortraitScore(asset, segment, topicBlob);
  return Math.max(base, portraitFloor);
}

/**
 * Ensure every scripted segment owns at least one topical video. A verified
 * video may be reused as bounded padding for an uncovered segment; global
 * unique-video floors still dedupe by URL, so this cannot inflate motion-rich
 * or airline strong-visual counts.
 *
 * @param {object} project
 * @returns {{ padded: object[], missingBefore: string[], missing: string[] }}
 */
export function ensureTopicalVideoCoverage(project) {
  const segments = Array.isArray(project?.script) ? project.script : [];
  if (!segments.length || !project) {
    return { padded: [], missingBefore: [], missing: [] };
  }
  if (!Array.isArray(project.media)) project.media = [];

  const media = project.media;
  const topicBlob = `${project.topic || ''} ${project.title || ''}`;
  const topicKeywords = extractKeywords(topicBlob, 12);
  const topicalForSegment = (segment) => media.filter((asset) => (
    asset?.segmentId === segment.id
    && topicalVideoScore(asset, segment, topicBlob, topicKeywords) >= VOLUME_PADDING_MIN_RELEVANCE
  ));
  const missingBefore = segments.filter((segment) => topicalForSegment(segment).length === 0);
  const padded = [];

  for (const segment of missingBefore) {
    const usedBySegment = new Set(
      media.filter((asset) => asset?.segmentId === segment.id).map(mediaAssetKey).filter(Boolean),
    );
    const reuseCounts = new Map();
    for (const asset of media) {
      const key = mediaAssetKey(asset);
      if (key) reuseCounts.set(key, (reuseCounts.get(key) || 0) + 1);
    }
    const candidates = media
      .map((asset) => ({
        asset,
        key: mediaAssetKey(asset),
        score: topicalVideoScore(asset, segment, topicBlob, topicKeywords),
      }))
      .filter(({ key, score }) => (
        key
        && !usedBySegment.has(key)
        && score >= VOLUME_PADDING_MIN_RELEVANCE
      ))
      .sort((a, b) => (
        (reuseCounts.get(a.key) || 0) - (reuseCounts.get(b.key) || 0)
        || b.score - a.score
      ));
    const candidate = candidates[0];
    if (!candidate) continue;

    const clone = {
      ...candidate.asset,
      id: `topical-topup-${segment.id}-${padded.length}`,
      segmentId: segment.id,
      source: `${candidate.asset.source || 'Topical video pool'} (topical volume top-up)`,
      relevanceScore: Math.round(candidate.score * 100) / 100,
      topicalVideoPadding: true,
    };
    media.push(clone);
    padded.push(clone);
  }

  const missing = segments
    .filter((segment) => topicalForSegment(segment).length === 0)
    .map((segment) => String(segment.id));
  return {
    padded,
    missingBefore: missingBefore.map((segment) => String(segment.id)),
    missing,
  };
}

/**
 * @param {object} project
 * @param {number} minPerSegment
 */
export function evaluateHarvestVolume(project, minPerSegment = 6) {
  const segments = project.script || [];
  const topicBlob = `${project.topic || ''} ${project.title || ''}`;
  const topicKeywords = extractKeywords(topicBlob, 12);
  const topicalCoverage = ensureTopicalVideoCoverage(project);
  const effectiveMin = isCrimeHeistTopic(topicBlob)
    ? Math.max(3, minPerSegment - 2)
    : minPerSegment;
  const perSegment = {};

  for (const seg of segments) {
    const assets = (project.media || []).filter((m) => m.segmentId === seg.id);
    const uniqueUrls = new Set(
      assets.map((a) => canonicalMediaKey(a.url || '')).filter(Boolean),
    );
    perSegment[seg.id] = {
      title: seg.title,
      count: uniqueUrls.size,
      videoCount: assets.filter(isVideoAsset).length,
      topicalVideoCount: new Set(
        assets
          .filter((asset) => (
            topicalVideoScore(asset, seg, topicBlob, topicKeywords) >= VOLUME_PADDING_MIN_RELEVANCE
          ))
          .map(mediaAssetKey)
          .filter(Boolean),
      ).size,
    };
  }

  const failing = Object.entries(perSegment)
    .filter(([, v]) => v.count < effectiveMin || v.topicalVideoCount < 1)
    .map(([id, v]) => ({
      segmentId: id,
      ...v,
      need: effectiveMin,
      topicalVideoNeed: 1,
      reasons: [
        ...(v.count < effectiveMin ? ['asset-volume'] : []),
        ...(v.topicalVideoCount < 1 ? ['topical-video-empty'] : []),
      ],
    }));

  return {
    pass: failing.length === 0,
    perSegment,
    minPerSegment: effectiveMin,
    requestedMinPerSegment: minPerSegment,
    crimeHeistTopic: isCrimeHeistTopic(topicBlob),
    topicalVideoPadding: topicalCoverage.padded.map((asset) => ({
      id: asset.id,
      segmentId: asset.segmentId,
      url: asset.url,
    })),
    failing,
  };
}

/**
 * Soft-pass when curated cyber stills, raw web-harvest motion, or stock-API motion
 * filled a thin harvest. Requires motion-rich timelines (enough videos per segment),
 * not stills alone. Web-native motion (Bing/Google/DuckDuckGo video, Vimeo,
 * Dailymotion, Giphy, /api/download-clip, HybridScraper, DeepHarvest, Archive.org)
 * is first-class live motion, so a web-video-rich pool can pass with no Pexels/Pixabay.
 *
 * @param {{ volumePass?: boolean, cyberStockInjected?: number, pexelsFetched?: number, pixabayFetched?: number, archiveLiveFetched?: number, videoTopUp?: unknown[] }} mediaReport
 * @param {object} project
 * @returns {{ pass: boolean, reason?: string }}
 */
export function evaluateHarvestVolumeWithSoftPass(mediaReport, project) {
  const volumePass = mediaReport?.volumePass;
  if (volumePass !== false) {
    if (volumePass === true) {
      const topicalCoverage = ensureTopicalVideoCoverage(project);
      if (topicalCoverage.missing.length) {
        return {
          pass: false,
          reason: `volume-topical-video-empty(${topicalCoverage.missing.join(',')})`,
        };
      }
      return { pass: true, reason: 'volume-hard-pass' };
    }
    // A missing verdict is not a pass: without a volume check there is nothing to soft-pass.
    return { pass: false, reason: 'volume-unknown-fail-closed' };
  }
  const topicalCoverage = ensureTopicalVideoCoverage(project);
  if (topicalCoverage.missing.length) {
    return {
      pass: false,
      reason: `volume-topical-video-empty(${topicalCoverage.missing.join(',')})`,
    };
  }
  const segments = project?.script || [];
  const segN = segments.length || 1;
  const media = project?.media || [];
  const uniqueVideos = [];
  const seenVideoKeys = new Set();
  for (const asset of media) {
    if (!(asset.type === 'video' || /\.mp4/i.test(asset.url || ''))) continue;
    const key = asset.url
      ? canonicalMediaKey(asset.url)
      : String(asset.id || `${asset.segmentId || ''}:${asset.alt || ''}:${asset.query || ''}`);
    if (!key || seenVideoKeys.has(key)) continue;
    seenVideoKeys.add(key);
    uniqueVideos.push(asset);
  }
  const videoCount = uniqueVideos.length;
  const videosPerSeg = videoCount / segN;
  const cyber = mediaReport.cyberStockInjected || 0;
  // Archive.org is a first-class keyless motion source (airline cold eval without Pexels).
  const stockFetched =
    (mediaReport.pexelsFetched || 0)
    + (mediaReport.pixabayFetched || 0)
    + (mediaReport.archiveLiveFetched || 0);
  const topUp = mediaReport.videoTopUp?.length || 0;
  const volume = mediaReport.harvestQuality;
  const minPer = volume?.minPerSegment ?? 6;
  const perSeg = volume?.perSegment ? Object.values(volume.perSegment) : [];
  const counts = perSeg.map((v) => v.count);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const avgCount = counts.length ? counts.reduce((s, v) => s + v, 0) / counts.length : 0;
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  const hasStockKeys = Boolean(
    process.env.PEXELS_API_KEY
      || process.env.VITE_PEXELS_KEY
      || process.env.PIXABAY_API_KEY
      || process.env.VITE_PIXABAY_KEY,
  );
  const liveStockPresent =
    stockFetched > 0
    || uniqueVideos.some((a) =>
      /pexels|pixabay|archive\.org|Archive\.org live/i.test(`${a.source || ''} ${a.url || ''}`),
    );
  // Raw web harvest (search-engine video, Vimeo/Dailymotion/Giphy, /api/download-clip,
  // HybridScraper, DeepHarvest, Archive.org) is the primary motion supply. Any of it
  // counts as first-class live motion even when no Pexels/Pixabay stock exists.
  const webNativeMotionVideos = uniqueVideos.filter(isWebNativeMotionSource);
  const webNativeMotionCount = webNativeMotionVideos.length;
  const liveMotionPresent = liveStockPresent || webNativeMotionCount > 0;
  // The Pexels/Pixabay anti-slideshow floor (16 unique topical videos) applies only
  // when stock API keys are present. Keyless Archive.org + raw-web runs must not
  // inherit that keyed floor — otherwise rejecting cookieless YouTube (correctly)
  // makes every Archive-heavy housing harvest fail unique-video-floor(14/16).
  const stockKeyMotionAvailable = hasStockKeys;
  const genericJunkVideos = uniqueVideos.filter((asset) => {
    const blob = `${asset.alt || ''} ${asset.query || ''} ${asset.source || ''} ${asset.title || ''} ${asset.url || ''}`;
    return isGenericStockJunk(blob, topicBlob);
  }).length;
  const uniqueTopicalVideos = videoCount - genericJunkVideos;
  const genericJunkRatio = videoCount ? genericJunkVideos / videoCount : 0;
  if (isAirlineTopic(topicBlob)) {
    const airlineSoftFail = airlineSoftPassMotionFailureReason(project, {
      genericJunkRatio,
      genericJunkVideos,
      uniqueVideos,
      videoCount,
    });
    if (airlineSoftFail) {
      return { pass: false, reason: airlineSoftFail };
    }
    // Never soft-pass a slideshow pool — need enough unique motion for dense cuts.
    // Without Pexels/Pixabay keys the only motion source is keyless Archive.org, which
    // cannot reach the stock-key floor; drop to ~one clip per segment and charge the
    // discount to the aviation-evidence majority below.
    const stockKeyAirlineVideos = Math.max(12, segN * 2);
    const minAirlineVideos = hasStockKeys
      ? stockKeyAirlineVideos
      : Math.max(AIRLINE_KEYLESS_SOFT_PASS_MIN_VIDEOS, segN);
    if (videoCount < minAirlineVideos) {
      return {
        pass: false,
        reason: `soft-pass-motion-airline-thin(${videoCount}/${minAirlineVideos} videos)`,
      };
    }
    if (!hasStockKeys && videoCount < stockKeyAirlineVideos) {
      // A discounted pool is only earned by visual aviation evidence (alt/title/URL),
      // never by the query we searched with.
      const strongVideos = countAirlineStrongVideos(uniqueVideos, topicBlob);
      const strongNeeded = Math.max(
        AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS,
        Math.ceil(videoCount / 2),
      );
      if (strongVideos < strongNeeded) {
        return {
          pass: false,
          reason: `soft-pass-motion-airline-keyless-evidence(${strongVideos}/${strongNeeded} videos)`,
        };
      }
    }
    // Web-native motion (raw web harvest) counts as live motion here, so a
    // web-video-rich pool passes without any Pexels/Pixabay/Archive stock.
    if (stockFetched > 0 || topUp >= segN || liveMotionPresent) {
      return { pass: true, reason: `soft-pass-motion-airline(${videoCount}v/${segN}segs)` };
    }
    // Airline harvests are judged by the airline gate alone — falling through to the
    // generic soft-passes would let stills/aggregate counts launder an untested pool.
    return {
      pass: false,
      reason: `soft-pass-motion-airline-no-live-motion(${videoCount}v/${segN}segs)`,
    };
  }

  // Healthcare (hospital / AI-medicine / clinical) — keyless web+Archive path, parallel
  // to airline. Discounted floor only when a clinical-evidence majority earns it.
  if (isHealthcareTopic(topicBlob)) {
    const healthcareSoftFail = healthcareSoftPassMotionFailureReason(project, {
      genericJunkRatio,
      genericJunkVideos,
      uniqueVideos,
      videoCount,
    });
    if (healthcareSoftFail) {
      return { pass: false, reason: healthcareSoftFail };
    }
    const stockKeyHealthcareVideos = Math.max(12, segN * 2);
    const minHealthcareVideos = hasStockKeys
      ? stockKeyHealthcareVideos
      : Math.max(HEALTHCARE_KEYLESS_SOFT_PASS_MIN_VIDEOS, segN);
    if (videoCount < minHealthcareVideos) {
      return {
        pass: false,
        reason: `soft-pass-motion-healthcare-thin(${videoCount}/${minHealthcareVideos} videos)`,
      };
    }
    if (!hasStockKeys && videoCount < stockKeyHealthcareVideos) {
      const strongVideos = countHealthcareStrongVideos(uniqueVideos, topicBlob);
      const strongNeeded = Math.max(
        HEALTHCARE_SOFT_PASS_MIN_STRONG_VIDEOS,
        Math.ceil(videoCount / 2),
      );
      if (strongVideos < strongNeeded) {
        return {
          pass: false,
          reason: `soft-pass-motion-healthcare-keyless-evidence(${strongVideos}/${strongNeeded} videos)`,
        };
      }
    }
    if (stockFetched > 0 || topUp >= segN || liveMotionPresent) {
      return { pass: true, reason: `soft-pass-motion-healthcare(${videoCount}v/${segN}segs)` };
    }
    return {
      pass: false,
      reason: `soft-pass-motion-healthcare-no-live-motion(${videoCount}v/${segN}segs)`,
    };
  }

  // No soft-pass may launder a junk-dominated video pool, whichever path would fire.
  if (videoCount > 0 && genericJunkRatio > SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return {
      pass: false,
      reason: `soft-pass-motion-generic-junk(${genericJunkVideos}/${videoCount} videos)`,
    };
  }

  // Soft-pass A: cyber stills + ≥1 video/seg
  if (cyber >= 6 && videosPerSeg >= 1) {
    return { pass: true, reason: `soft-pass-cyber(${cyber})` };
  }
  // Soft-pass B: ≥2 videos/seg + live stock/top-up
  const motionMinPerSeg = 2;
  const motionRich = videosPerSeg >= motionMinPerSeg && (stockFetched > 0 || topUp >= segN);
  if (motionRich) {
    if (stockKeyMotionAvailable && uniqueTopicalVideos < 16) {
      return {
        pass: false,
        reason: `soft-pass-motion-unique-video-floor(${uniqueTopicalVideos}/16 topical videos)`,
      };
    }
    return { pass: true, reason: `soft-pass-motion(${videoCount}v/${segN}segs)` };
  }
  // Soft-pass B2: raw web harvest motion (no Pexels/Pixabay/top-up needed).
  // Web-native video is the primary supply, so a web-video-rich pool passes on its
  // own — but it still has to clear the same unique-topical-video floor (16) so a
  // thin slideshow cannot sneak through. Thin web pools fall through to the
  // aggregate/cold floors below rather than hard-failing here.
  const webMotionRich = videosPerSeg >= motionMinPerSeg && webNativeMotionCount > 0;
  if (webMotionRich && uniqueTopicalVideos >= 16) {
    return {
      pass: true,
      reason: `soft-pass-web-motion(${webNativeMotionCount}web/${videoCount}v/${segN}segs)`,
    };
  }
  // Soft-pass C: uneven but adequate
  const aggregateOk =
    minCount >= Math.max(2, Math.floor(minPer * 0.5))
    && avgCount >= minPer * 0.75
    && media.length >= segN * Math.max(3, minPer - 2);
  if (aggregateOk) {
    return { pass: true, reason: `soft-pass-aggregate(avg=${avgCount.toFixed(1)}, min=${minCount})` };
  }
  // Soft-pass C2 (cold): no empty segs + enough unique motion for dense cuts
  if (
    isEvalColdMode()
    && minCount >= 2
    && avgCount >= 3
    && media.length >= segN * 3
    && videoCount >= Math.max(segN * 3, 9)
    && (stockFetched > 0 || topUp > 0)
  ) {
    return { pass: true, reason: `soft-pass-cold-thin(avg=${avgCount.toFixed(1)}, min=${minCount}, v=${videoCount})` };
  }
  // Soft-pass D: crime/heist, no empty segs
  if (
    isCrimeHeistTopic(topicBlob)
    && minCount >= 2
    && media.length >= segN * (minPer - 1)
  ) {
    return { pass: true, reason: `soft-pass-crime-heist(${media.length} assets/${segN} segs)` };
  }
  return { pass: false, reason: 'volume-hard-fail' };
}

/** Shared junk ceiling for every non-airline soft-pass path. */
const SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.4;

const AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS = 4;
/** Keyless airline runs fill from Archive.org only, so the motion floor is per-segment. */
const AIRLINE_KEYLESS_SOFT_PASS_MIN_VIDEOS = 6;
const AIRLINE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.25;
const AIRLINE_SOFT_PASS_HARD_JUNK_RATIO_MAX = 0.12;

const HEALTHCARE_SOFT_PASS_MIN_STRONG_VIDEOS = 4;
/** Keyless healthcare runs fill from web+Archive; floor matches airline keyless. */
const HEALTHCARE_KEYLESS_SOFT_PASS_MIN_VIDEOS = 6;
const HEALTHCARE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.25;
const HEALTHCARE_SOFT_PASS_HARD_JUNK_RATIO_MAX = 0.12;

const AIRLINE_HARD_REJECT_PATTERNS = [
  {
    reason: 'medical-patient-nurse',
    pattern:
      /\b(hospital\s+patient|medical\s+patient|patient\s+(?:bed|ward|room|monitor|care)|nurses?|nursing\s+station|doctor|surgeon|surgery|icu|iv\s+drip|hospital\s+bed|ambulance\s+stretcher)\b/i,
  },
  {
    reason: 'mail-mailbox',
    pattern:
      /\b(mailbox(?:es)?|mail\s+(?:carrier|truck|delivery|sorting|room|bag|slot)|postal\s+(?:worker|truck|service|delivery)|post\s+office|letters?\s+in\s+(?:a\s+)?mailbox)\b/i,
  },
  {
    reason: 'financial-reports',
    pattern:
      /\b(financial\s+reports?|annual\s+reports?|quarterly\s+reports?|financial\s+statements?|spreadsheet\s+reports?)\b/i,
  },
  {
    reason: 'medical-clickbait',
    pattern: MEDICAL_CLICKBAIT_ANY_RE,
    requires: MEDICAL_CLICKBAIT_CONTEXT_RE,
  },
  {
    reason: 'military-naval',
    pattern: MILITARY_NAVAL_VISUAL_RE,
    skipWhen: MILITARY_TOPIC_RE,
  },
  {
    reason: 'wildfire-grid-solar',
    pattern: AIRLINE_WILDFIRE_GRID_JUNK_RE,
    skipWhen: /\b(wildfire|forest\s*fire|grid\s*failure|solar\s*farm)\b/i,
  },
  {
    reason: 'tech-clickbait',
    pattern: AIRLINE_TECH_CLICKBAIT_JUNK_RE,
  },
  {
    reason: 'booking-promo',
    pattern: AIRLINE_BOOKING_PROMO_JUNK_RE,
  },
  {
    reason: 'false-pressure',
    pattern: AIRLINE_FALSE_PRESSURE_JUNK_RE,
  },
  {
    reason: 'solar-fuel-promo',
    pattern: AIRLINE_SOLAR_FUEL_PROMO_RE,
    skipWhen: AIRLINE_SOLAR_FUEL_TOPIC_RE,
  },
  {
    reason: 'film-strip-graphic',
    pattern: FILM_STRIP_GRAPHIC_RE,
    skipWhen: FILM_TOPIC_CONTEXT_RE,
  },
  {
    reason: 'politics-pad',
    pattern: AIRLINE_POLITICS_PAD_RE,
    skipWhen: /\b(clinton|lynch|budget|congress|election)\b/i,
  },
];

const AIRLINE_STRONG_CABIN_RE =
  /\b(?:airplane|aircraft|plane|flight|airline)\s+cabin\b|\bcabin\s+(?:interior|pressure|altitude|crew|passengers?|oxygen|mask|overhead)\b/i;
const AIRLINE_STRONG_COCKPIT_RE = /\bcockpit\b|\bflight\s+deck\b/i;
const AIRLINE_STRONG_OXYGEN_RE = /\boxygen\s*masks?\b|\bdeployed\s+masks?\b/i;
const AIRLINE_STRONG_AIRCRAFT_RE =
  /\b(aircraft|airplane|aeroplane|plane|jet|airliner|fuselage|flight|aviation)\b/i;
const AIRLINE_STRONG_HANGAR_RE = /\bhangar\b/i;
const AIRLINE_STRONG_RUNWAY_RE = /\brunway\b|\btarmac\b/i;

function uniqueVideoAssets(media = []) {
  const uniqueVideos = [];
  const seenVideoKeys = new Set();
  for (const asset of media) {
    if (!(asset.type === 'video' || /\.mp4/i.test(asset.url || ''))) continue;
    const key = asset.url
      ? canonicalMediaKey(asset.url)
      : String(asset.id || `${asset.segmentId || ''}:${asset.alt || ''}:${asset.query || ''}`);
    if (!key || seenVideoKeys.has(key)) continue;
    seenVideoKeys.add(key);
    uniqueVideos.push(asset);
  }
  return uniqueVideos;
}

function airlineVideoBlob(asset = {}) {
  return `${asset.alt || ''} ${asset.title || ''} ${asset.source || ''} ${asset.sourceUrl || ''} ${asset.url || ''} ${asset.query || ''}`;
}

function airlineHardRejectReason(asset = {}, topicBlob = '') {
  const blob = airlineVideoBlob(asset);
  const ctx = String(topicBlob || '');
  for (const { reason, pattern, requires, skipWhen } of AIRLINE_HARD_REJECT_PATTERNS) {
    if (skipWhen && skipWhen.test(ctx)) continue;
    if (requires && !requires.test(blob)) continue;
    if (pattern.test(blob)) return reason;
  }
  return null;
}

function isAirlineStrongVideo(asset = {}, topicBlob = '') {
  const topic = String(topicBlob || '') || 'airline cabin pressure';
  // Rejections read the full blob (query included) so junk fails closed…
  if (
    airlineHardRejectReason(asset, topic)
    || isGenericStockJunk(airlineVideoBlob(asset), topic)
  ) {
    return false;
  }
  // …but aviation proof has to come from the media, not the string we searched with —
  // except for web-native clips (raw web harvest), where real page titles/alts and the
  // deliberate harvest query are all legitimate evidence (parallel to Archive.org's
  // evidence verdict). Stock clips still prove themselves visually only.
  const visualBlob = visualEvidenceBlob(asset);
  const blob = isWebNativeMotionSource(asset)
    ? `${visualBlob} ${webNativeEvidenceBlob(asset)}`.replace(/\s+/g, ' ').trim()
    : visualBlob;
  if (!blob) return false;
  if (AIRLINE_STRONG_CABIN_RE.test(blob)) return true;
  if (AIRLINE_STRONG_COCKPIT_RE.test(blob)) return true;
  if (AIRLINE_STRONG_OXYGEN_RE.test(blob)) return true;
  if (AIRLINE_STRONG_HANGAR_RE.test(blob) && AIRLINE_STRONG_AIRCRAFT_RE.test(blob)) return true;
  if (AIRLINE_STRONG_RUNWAY_RE.test(blob) && AIRLINE_STRONG_AIRCRAFT_RE.test(blob)) return true;
  if (
    /\b(airplane cabin|pilot cockpit|flight attendant airplane|passenger oxygen mask|oxygen mask deploy|maintenance hangar|mechanic tools aircraft|cabin pressure gauge|airport runway plane|aircraft maintenance|airplane|aircraft|cockpit|hangar|runway|tarmac|boarding)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  // Everyday aviation vocabulary (plane/jet/airliner/airline/flight, Boeing/Airbus,
  // turbulence/pressurization/decompression/emergency landing) is what real web
  // harvest titles and queries actually use. Junk (military/medical/mail/etc.) was
  // already rejected above, so a surviving blob with this evidence is genuine
  // aviation motion — the fix that lets Bing/Google "download-clip" web clips count.
  if (AIRLINE_AVIATION_EVIDENCE_RE.test(blob)) return true;
  return false;
}

/**
 * Unique videos carrying real aviation visual evidence (hard-junk pads already excluded).
 *
 * @param {object[]} [uniqueVideos]
 * @param {string} [topicBlob]
 */
export function countAirlineStrongVideos(uniqueVideos = [], topicBlob = '') {
  return uniqueVideos.filter((asset) => isAirlineStrongVideo(asset, topicBlob)).length;
}

export function airlineSoftPassMotionFailureReason(project, stats = {}) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  if (!isAirlineTopic(topicBlob)) return null;

  const uniqueVideos = stats.uniqueVideos || uniqueVideoAssets(project?.media || []);
  const videoCount = stats.videoCount ?? uniqueVideos.length;

  const hardJunkVideos = uniqueVideos.filter((asset) => airlineHardRejectReason(asset, topicBlob));
  const hardJunkRatio = videoCount ? hardJunkVideos.length / videoCount : 0;
  // Fail closed on a junk-dominated pool, but don't nuke a clean top-up over 1–2 leftovers.
  if (
    hardJunkVideos.length >= 3
    || (videoCount > 0 && hardJunkRatio > AIRLINE_SOFT_PASS_HARD_JUNK_RATIO_MAX)
  ) {
    const reason = airlineHardRejectReason(hardJunkVideos[0], topicBlob) || 'hard-junk';
    return `soft-pass-motion-airline-junk(${reason}:${hardJunkVideos.length}/${videoCount})`;
  }

  const cleanVideos = uniqueVideos.filter((asset) => !airlineHardRejectReason(asset, topicBlob));
  const genericJunkVideos = stats.genericJunkVideos ?? cleanVideos.filter((asset) => (
    isGenericStockJunk(airlineVideoBlob(asset), topicBlob)
  )).length;
  const cleanCount = cleanVideos.length || videoCount;
  const genericJunkRatio = stats.genericJunkRatio ?? (cleanCount ? genericJunkVideos / cleanCount : 0);
  if (genericJunkRatio > AIRLINE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return `soft-pass-motion-airline-generic-junk(${genericJunkVideos}/${cleanCount} videos)`;
  }

  const strongVideos = countAirlineStrongVideos(cleanVideos, topicBlob);
  const hasStockKeys = Boolean(
    process.env.PEXELS_API_KEY
      || process.env.VITE_PEXELS_KEY
      || process.env.PIXABAY_API_KEY
      || process.env.VITE_PIXABAY_KEY,
  );
  const strongFloor = hasStockKeys
    ? AIRLINE_SOFT_PASS_MIN_STRONG_VIDEOS
    : 1;
  if (strongVideos < strongFloor) {
    return `soft-pass-motion-airline-aviation-strong-floor(${strongVideos}/${strongFloor} videos)`;
  }

  return null;
}

/** Hard-reject pads that must not soft-pass a healthcare harvest. */
const HEALTHCARE_HARD_REJECT_PATTERNS = [
  {
    reason: 'healthcare-off-topic-broll',
    pattern: HEALTHCARE_OFF_TOPIC_BROLL_RE,
  },
  {
    reason: 'bank-otp-scam',
    pattern:
      /\b(otp|one[\s-]?time\s*pass(?:word|code)?|voice[\s-]?clone|wire\s*transfer|callback\s*scam|bank\s*(?:otp|fraud|scam)|sms\s*otp)\b/i,
  },
  {
    reason: 'mail-mailbox',
    pattern:
      /\b(mailbox(?:es)?|mail\s+(?:carrier|truck|delivery|sorting|room|bag|slot)|postal\s+(?:worker|truck|service|delivery)|post\s+office)\b/i,
  },
  {
    reason: 'military-naval',
    pattern: MILITARY_NAVAL_VISUAL_RE,
    skipWhen: MILITARY_TOPIC_RE,
  },
  {
    reason: 'airline-cabin',
    pattern:
      /\b(?:airplane|aircraft|plane|airline)\s+cabin\b|\bcockpit\b|\bflight\s+deck\b|\boxygen\s*masks?\b|\brunway\b|\btarmac\b/i,
    skipWhen: /\b(medevac|air\s*ambulance|medical\s*(?:flight|evacuation))\b/i,
  },
  {
    reason: 'nursing-abuse-cctv',
    pattern:
      /\b(nursing\s*home\s*(?:abuse|cctv|surveillance)|elder\s*abuse|care\s*home\s*abuse)\b/i,
    skipWhen: /\bnursing\s*home|elder\s*abuse|care\s*home\b/i,
  },
  {
    reason: 'empty-hospital-bed',
    pattern: EMPTY_HOSPITAL_BED_RE,
  },
  {
    reason: 'film-strip-graphic',
    pattern: FILM_STRIP_GRAPHIC_RE,
    skipWhen: FILM_TOPIC_CONTEXT_RE,
  },
  {
    reason: 'tech-clickbait',
    pattern: AIRLINE_TECH_CLICKBAIT_JUNK_RE,
  },
  {
    reason: 'sports-pad',
    pattern: /\b(football|soccer|athlete|stadium\s+crowd|sports\s+crowd|cheering\s+fans)\b/i,
  },
];

function healthcareVideoBlob(asset = {}) {
  return `${asset.alt || ''} ${asset.title || ''} ${asset.source || ''} ${asset.sourceUrl || ''} ${asset.url || ''} ${asset.query || ''}`;
}

function healthcareHardRejectReason(asset = {}, topicBlob = '') {
  const blob = healthcareVideoBlob(asset);
  const ctx = String(topicBlob || '');
  for (const { reason, pattern, skipWhen } of HEALTHCARE_HARD_REJECT_PATTERNS) {
    if (skipWhen && skipWhen.test(ctx)) continue;
    if (pattern.test(blob)) return reason;
  }
  return null;
}

function isHealthcareStrongVideo(asset = {}, topicBlob = '') {
  const topic = String(topicBlob || '') || 'healthcare hospital';
  if (
    healthcareHardRejectReason(asset, topic)
    || isGenericStockJunk(healthcareVideoBlob(asset), topic)
  ) {
    return false;
  }
  const visualBlob = visualEvidenceBlob(asset);
  const blob = isWebNativeMotionSource(asset)
    ? `${visualBlob} ${webNativeEvidenceBlob(asset)}`.replace(/\s+/g, ' ').trim()
    : visualBlob;
  if (!blob) return false;
  return HEALTHCARE_EVIDENCE_RE.test(blob);
}

/**
 * Unique videos carrying real clinical / hospital / AI-medicine evidence.
 *
 * @param {object[]} [uniqueVideos]
 * @param {string} [topicBlob]
 */
export function countHealthcareStrongVideos(uniqueVideos = [], topicBlob = '') {
  return uniqueVideos.filter((asset) => isHealthcareStrongVideo(asset, topicBlob)).length;
}

export function healthcareSoftPassMotionFailureReason(project, stats = {}) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  if (!isHealthcareTopic(topicBlob)) return null;

  const uniqueVideos = stats.uniqueVideos || uniqueVideoAssets(project?.media || []);
  const videoCount = stats.videoCount ?? uniqueVideos.length;

  const hardJunkVideos = uniqueVideos.filter((asset) => healthcareHardRejectReason(asset, topicBlob));
  const hardJunkRatio = videoCount ? hardJunkVideos.length / videoCount : 0;
  if (
    hardJunkVideos.length >= 3
    || (videoCount > 0 && hardJunkRatio > HEALTHCARE_SOFT_PASS_HARD_JUNK_RATIO_MAX)
  ) {
    const reason = healthcareHardRejectReason(hardJunkVideos[0], topicBlob) || 'hard-junk';
    return `soft-pass-motion-healthcare-junk(${reason}:${hardJunkVideos.length}/${videoCount})`;
  }

  const cleanVideos = uniqueVideos.filter((asset) => !healthcareHardRejectReason(asset, topicBlob));
  const genericJunkVideos = stats.genericJunkVideos ?? cleanVideos.filter((asset) => (
    isGenericStockJunk(healthcareVideoBlob(asset), topicBlob)
  )).length;
  const cleanCount = cleanVideos.length || videoCount;
  const genericJunkRatio = stats.genericJunkRatio ?? (cleanCount ? genericJunkVideos / cleanCount : 0);
  if (genericJunkRatio > HEALTHCARE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return `soft-pass-motion-healthcare-generic-junk(${genericJunkVideos}/${cleanCount} videos)`;
  }

  const strongVideos = countHealthcareStrongVideos(cleanVideos, topicBlob);
  const hasStockKeys = Boolean(
    process.env.PEXELS_API_KEY
      || process.env.VITE_PEXELS_KEY
      || process.env.PIXABAY_API_KEY
      || process.env.VITE_PIXABAY_KEY,
  );
  const strongFloor = hasStockKeys
    ? HEALTHCARE_SOFT_PASS_MIN_STRONG_VIDEOS
    : 1;
  if (strongVideos < strongFloor) {
    return `soft-pass-motion-healthcare-clinical-strong-floor(${strongVideos}/${strongFloor} videos)`;
  }

  return null;
}
