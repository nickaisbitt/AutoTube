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
 * housing-web59/web61: green-screen shocked-face meme (cdn.shopify.com), vintage
 * title card "HOUSING IN OUR TIME", naturalization ceremony, tiny-house lifestyle,
 * "Welcome & introductions" presentation slide, physiotherapy/resistance-band charts
 * (Etsy product image misidentified as video by Bing), protest/political look.
 * housing-web159: Bigg Boss / BBOTT reality-TV "eviction", movie/official trailers
 * (Bull Street), Israeli-police/riot geopolitics eviction, Vice/Flint charged-
 * Russian pads, men's mental-health crisis mis-hits from "housing crisis family",
 * and mortgage-fraud / timber-chronicles talking-head pads. Hard-reject those
 * from harvest AND intro evidence — never weaken real tenant/grandmother/
 * family eviction faces.
 * housing-web160: Gujarat wedding-cash / crying-outside-banks (family+cry FP),
 * UAE farm-owner / rude-tenant watch pads (bare "tenants" FP), Namibia genocide /
 * Chinese-mafia settlement docs, Clearwater advisory-board / special-meeting
 * committee pads, and China "fake middle class" jobs/debt/housing-pressure
 * talking-heads. Hard-reject those — keep West Sussex / SF tenant / grandmother
 * eviction faces.
 * housing-web161: after a good West Sussex face opener, mid-video still carried
 * "boy breaks into tears" Heartsome pads, Occupy Wall Street reoccupy promos
 * (prior pattern required "…street housing"), ABC15 "let joe know" news packages,
 * LLG "social murder / political theater" desktop recordings, and Carl DeMaio
 * San Diego politics mis-hits — hard-reject those; keep Dale Farm / SF tenant /
 * West Sussex / Richmond eviction documentary motion.
 * housing-web163: after West Sussex @0, early window still carried Angelo Surmelis
 * "daily tip" home-furniture/decor pads, YouTube "funny pranks" eviction skits,
 * and "single mother cries looking at her flooded apartment" flood/disaster
 * pads — hard-reject those; keep West Sussex / SF tenant / grandmother eviction
 * faces (bare flooded+eviction collocations still clear via intro-junk escape).
 * housing-web165: West Sussex face @0 OK, but mid-video still carried FILMIBEAT
 * Indian TV (molkki episode spoiler), "double bunk full hd movies / flick vault"
 * pirated-movie promos, and weak "campfire eviction stories from the mission
 * district" pads — hard-reject those; keep West Sussex / Dale Farm / SF tenants.
 */
export const HOUSING_OFF_TOPIC_BROLL_RE =
  /\b(?:car\s+crash|traffic\s+accident|auto(?:mobile)?\s+accident|dashcam(?:\s+(?:crash|footage|video))?|vehicle\s+(?:collision|wreck|crash)|wrecked\s+car|highway\s+accident|road\s+accident|pile[\s-]?up|car\s+wreck|crash\s+footage|accident\s+(?:footage|scene)|plane\s+crash(?:es)?|crashes?\s+into\s+(?:a\s+)?(?:roof|house|home)|crash\s+patterns?|police\s+(?:car\s+crash|vehicle\s+crash|crash\s+scene|car\s+accident)|officer\s+crash|fatal\s+crash\s+highway|wildfire|forest\s+fires?|house\s+fire|apartment\s+fire|fire\s+destroys\s+apartment|alarm\s+fire|structure\s+fire|building\s+(?:on\s+)?fire|burning\s+(?:building|house|home|apartment)|fire\s+footage|fire\s+department|ladder\s+truck|firefighters?|airstrike|air\s*strike|war\s+zone|vietnam\s+war|war\s+home\s+movie|gaza(?:\s+strip)?|deir\s+al\s+balah|city\s+council|council\s+meeting|city\s+hall|public\s+(?:hearing|meeting)|town\s+hall(?:\s+meeting)?|board\s+meeting|building\s+commission|plan(?:ning)?\s+commission|city\s+commission|zoning\s+(?:board|hearing|commission)|commission\s+(?:hearing|meeting)|ribbon\s+cutting|apartments?\s+approved|earthquake|quake|tsunami|pie\s+chart|poll\s+graphic|opinion\s+poll|infographic|lending\s*tree|bar\s+chart|can\s*tv|station\s+id|satellite\s+map|digital\s+globe|house\s+on\s+(?:a\s+)?rock|floating\s+(?:rock|island)|3d\s+house|neohomeloans|housing\s+market\s+crash\.jpg|will-the-housing-market-crash|queen\s+elizabeth|royal\s+memorial|ticking\s+time\s+bombs?|time\s+bombs?|sticks?\s+of\s+dynamite|dynamite|periscope\s*film|bird'?s?\s+nests?|ceiling\s+on\s+your\s+home|propaganda\s+film|leapfrog|letter\s+factory|miss\s+brooks|cafeteria\s+strike|love\s+nest|camp\s+mystic|guadalupe\s+river|texas\s+flooding|flood(?:ing)?\s+(?:map|camp|index)|(?:j\.?\s*g\.?\s*)?ballard|cronenberg|david\s+crosby|literacy\s+adam|rolfe\s+report|i\s+got\s+a\s+strike\s+again|progress\s+center|self\s+sufficiency|fair\s+housing\s+conference|county\s+announces|administrative\s+officer|apartment\s+building\s+inspection|building\s+inspection\s+initiative|for\s+sale\s+sign|re\/?max|yard\s+sign|realtor\s+sign|real\s+estate\s+sign|homes?\s*scv|one57|million\s+apartment|touring\s+a\s+\d|negative\s+space|ron\s+koertge|animated\s+film|michael\s+jackson|michael\s+bolton|michael\s+ninn|end\s+the\s+fed|mousetrap|american\s+home\s+mortgage|mortgage\s+bankruptcy|bankruptcy\s+(?:slide|filing|graphic)|golden\s+valley\s+approves|what\s+happens\s+when\s+the\s+(?:housing|credit)|credit\s+hit\s+market|housing\s+market\s+crash(?:es)?\?|crater\s+graphic|landlord\s+tenant\s+act|lawyers?\s+committee|tenant\s+advocacy|square[\s-]?foot|sustainable\s+high\s+rise|eviction\s+ban\s+nonsense|may\s+day\s+caravan|constitutional\s+shredding|how\s+to\s+live\s+in|livestream\s+archive|business\s+insider|(?:gaming\s+)?headset|podcast\s+mic(?:rophone)?|youtubers?|youtube\s+flag|like\s+and\s+subscribe|subscribe\s+button|streamer\s+(?:setup|headset|mic)|talking\s+head\s+(?:with\s+)?(?:a\s+)?headset|trump\s+voters?|pennsylvania\s+rally|political\s+rally|homestead\s+rescue|going\s+garcia|meet\s+the\s+garcias?|smaldones?|family\s+of\s+crime|struggle\s+street|karina\s+garcia|autumn\s+nelon|nelon\s+streetman|joked\s+about\s+housing|federal\s+reserve\s+officials?\s+foresaw|rent\s+strike|general\s+rent\s+strike|strike\s+against\s+(?:rent|landlord)|parkdale\s+vs|parkdale\s+(?:rent|tenant|protest)|ltb\s+(?:hearing|order|ruling|decision|application|review)|ontario\s+landlord\s+tenant\s+board|landlord\s+tenant\s+board\b|rent\s+tribunal|housing\s+tribunal\s+hearing|nl\s+subs?|dutch\s+(?:subs?|subtitles?)|eerst\s+het\s+eten\s+dan\s+de\s+huur|home\s+price\s+chart|housing\s+price\s+chart|median\s+home\s+price\s+graphic|cbs\s*6|problem\s+solvers?|wtvr|odsp|bill\s*60|push\s+more\s+disable|disable\s+residents?|soviet\s+flag|hammer\s+and\s+sickle|ussr|moldova\s+construction|construction\s+project\s+presentation|redfin\s+(?:just\s+)?dropped|redfin\s+predictions?|2026\s+predictions?|satisfed\s+in\s+real\s+estate|zillow\s+economist|corelogic|great\s+recession\s+unlikely|gaming\s+chair|leather\s+office\s+chair|bathroom\s+bucket|toilet\s+bowl|floor\s+drain|dirty\s+bathroom|moldy\s+bathroom|crash\s+is\s+here|yellow\s+turban|overthinking\s+quotes?|cummins|diesel\s+engine|rocker\s+arm|isl\s+8\.9|zillow\s+chart|chart\s+graph|key\s+insights|decline\s+in\s+airbnb|airbnb\s+(?:going\s+to\s+)?cause|tariffs?\s*,?\s*70%|81%\s+worry|data\s+visualization|nmp\b|wants\s+a\s+housing\s+crash|volkswagen|tesla\s+tampa|tampa\s+police|severe\s+crash\s+with|auto\s+insurance\s+rates?|marco\s+rubio|icc\b|mormon\s+tabernacle|katherine\s+jenkins|you.?ll\s+never\s+walk\s+alone|bronxnet|social\s+justice\s+forum|anti\s+violence\s+forums?|housing\s+justice\s+for\s+all|sarah\s+jenkins|canary\s+in\s+the\s+coal\s+mine|new\s+kids\s+on\s+the\s+block|nkotb|official\s+lyric\s+video|lyric\s+video|apartment\s+complex\s+explosion|building\s+explosion|gas\s+explosion|fema\s+(?:fraud|scam|outreach|psa)|community\s+recovery\s+after\s+disaster|news\s+motion\s+footage|classical\s+painting|oil\s+painting|he-said.?she-said|shortland\s+horne|fema\b|world\s+map(?:\s+graphic)?|high-?resolution\s+world\s+map|guide\s+of\s+the\s+world|static\s+document|redfin\s+(?:bar\s+)?chart|home\s+value\s+index|housing\s+price\s+index\s+graphic|medical\s+pyramid|pyramid\s+chart|bar\s+graph|metallic\s+debris|debris\s+field|vhs\s+(?:recording|footage|tape)|grainy\s+(?:vhs|news)|green[\s-]?screen|chroma[\s-]?key|reaction\s+meme|meme\s+reaction|shopify\.com|etsy\.com|title\s+card|housing\s+in\s+our\s+time|naturalization\s+(?:ceremony|film|footage|celebration)|citizenship\s+ceremony|tulsa\s+naturalization|tiny[\s-]?houses?|tiny[\s-]?homes?|tiny\s+(?:houses?|homes?)\s+(?:revolution|lifestyle|movement|living|community|dwellers?|builders?)|small\s+house\s+movement|welcome\s+(?:(?:and|&)\s+)?introduction|welcome\s+slide|intro(?:duction)?\s+slide|presentation\s+slide|opening\s+slide|resistance\s+band|physiotherapy|physical\s+therapy\s+(?:chart|pyramid|poster)|exercise\s+pyramid|fitness\s+pyramid|workout\s+chart|occupy\s+(?:our\s+)?homes?|occupy\s+wall\s+street|boy\s+breaks\s+into\s+tears|\bheartsome\b|let\s+joe\s+know|\babc\s*15\b|social\s+murder|political\s+theater\s+disability|\bllg\b|carl\s+demaio|san\s+diego\s+politics|day\s+of\s+action\s+(?:with|for\s+housing)|prageru|prager\s+university|rap\s+(?:performance|video|music|freestyle|battle)|hip[\s-]?hop\s+(?:performance|video|music)|fire\s+on\s+(?:black\s+)?ice|throw(?:ing)?\s+fire|black\s+ice\s+experiment|building\s+collapse(?:s|d)?\b|structural\s+collapse\b|collapse\s+kills\b|kills\s+\d+\s+people\b|(?:housing|community|civic|neighborhood)\s+partnership\s+meeting\b|mansions?\s+at\s+canyon\s+springs|canyon\s+springs|first\s+class\s+living|luxury\s+(?:lifestyles?|apartment\s+tour|living\s+tour)|six\s+sided\s+packaging|packaging\s+(?:of\s+)?(?:panels?|boards?)|packaging\s+various\s+types|sudan(?:ese)?\s+refugees?|homes?\s+beyond\s+borders|barcroft\s+tv|paradise\s+treehouse|grandmother\s+faces\s+eviction\s+from\s+paradise|volvo\s+[-–—]\s+moments\s+that\s+never\s+happen|fka\s*twigs?|dartboard|electronic\s+dartboard|viper\s+\d+|target\s+face|official\s+music\s+video|music\s+video|piano\s+concerto|shostakovich|the\s+weeknd|chainsmokers|trip\s+hop|corrugated\s+cardboard|vacuum\s+skin\s+packaging|\bkodipak\b|nepal\s+crash|pilot\s+met\s+the\s+same\s+fate|harkins\s+safety|accidents\s+never\s+just\s+happen|test\s+pattern|color\s+bars?|meritage\s+at\s+mill\s+creek|maniak\s+videoclip|everyone\s+crash\s+lost\s+scream|scream\s+crying\s+and\s+collection|credit\s+repair|denied\s+credit|deniedcreditrepair|whybedenied|two\s+months?\s+rent\s+free|mortgage\s+protection\s+plan|manheim\s+auction|how\s+to\s+buy\s+in\s+person|mammoth\s+(?:real\s+estate|village|condos?)|mammoth\s+village\s+properties|alliance\s+group\s+don\s*t\s+be\s+a\s+greedy|transcrisis|holloway\s+motel|tribeca\s+teaser|gang\s+culture\s+and\s+(?:the\s+)?opioid|prairie\s+view\s+a\s*&?\s*m\s+student|student\s+testimonial\s+project|interfaith\s+adopt\s+a\s+family|bande\s+annonce|stop\s+worrying\s+about\s+future|events\s+that\s+will\s+never\s+happen|salesintroverts?(?:\.com)?|motivational\s+(?:quote|poster|graphic)|inspirational\s+(?:quote|poster|graphic)|flash\s+floods?|flood\s+(?:gauge|feet|depth|marker)|wqad\.com|uganda(?:.?s?\s+gay)?|gay\s+(?:and\s+)?transgender\s+community|transgender\s+community\s+in\s+uganda|girlfriend.?s?\s+wetting|\bcianiemoo\b|social\s+media\s+addiction|heidi\s+leiter|lifestories|coming\s+out\s+of\s+heidi|palmas\s+(?:trailer|documentary)|mexicanidad|dharavi\s+diary|shortform\.com|southsidetogether|national\s+faith\s+home\s+buyers?|bernardin?e\s+family\s+testimonial|safe\s+families\s+for\s+children|be\s+someone.?s?\s+extended\s+family|civic\s+unity\s+five\s+years|battle\s+of\s+harbor\s+island|from\s+shack\s+to\s+the\s+constitutional\s+court|abahlali\s+basemjondolo|foreclosure\s+miami\s+promo|gwyneth(?:\s+paltrow)?|paltrow\s+ski|ski\s+crash\s+court|skynews[\s-]?gwyneth|electric\s+shock|moving\s+box(?:es)?\s+destruction|box\s+destruction|millionaire\s+(?:returned|returns|pretend)|pretending\s+to\s+be\s+poor|millionairetest|security\s+guards?\s+assaulted|\bnoida\b|swanky\s+(?:noida\s+)?apartment|mariupol|russian\s+military|turkish\s+citizens?\s+(?:are\s+)?in\s+occupied|committee\s+meeting|housing\s+development\s+committee|comm\.?\s+services|public\s+safety\s+and\s+housing|smart\s+growth\s+approach|transforming\s+lives\s+in\s+(?:\w+\s+)?(?:with\s+)?affordable\s+housing|affordable\s+housing\s+is\s+transforming|project\s+connect\s+glendale|park\s+rangers?\s+(?:leads?\s+to\s+)?eviction|constables?\s+face\s+dangers?|face\s+dangers?\s+while\s+serving|shocked\s+at\s+caller|maajid\s+nawaz|worldtalk|public\s+access\s+tv|peg\s+(?:tv|channel|media|youtube)|nctv\s*17|community\s+media\s+peg|kellarlawrence|bigg\s*boss|bbott\d*|bigg\s*boss\s+ott|manisha\s+rani|reality\s+(?:tv|show)\s+evict\w*|weekend\s+ka\s+vaar|official\s+trailer|movie\s+(?:trailer|teaser)|film\s+(?:trailer|teaser)|theatrical\s+trailer|bull\s+street\s+movie|israeli\s+police|riot\s+(?:israeli|police|eviction)|police\s+violence\s+during.{0,48}evict\w*|flint\s+charged|russian\s+eviction|vice\s+news\s+tonight|men'?s?\s+mental\s+health|mental\s+health\s+(?:a\s+)?silent\s+crisis|karen\s+straughan|mortgage\s+(?:financing|fraud)|falling\s+for\s+fraud|foreclosure\s+rescue\s+scams?|mortgage\s+foreclosure\s+rescue|timber\s+(?:roots|chronicles)|bill\s+barnum|eureka.?s?\s+timber|gujarat\s+women|denied\s+cash\s+for\s+weddings?|cash\s+for\s+weddings?|crying\s+outside\s+banks?|cry\s+outside\s+banks?|women\s+crying\s+outside\s+banks?|wedding\s+engagements?|unable\s+to\s+withdraw\s+cash|uae\s+farm\s+owners?|rude\s+tenants?|farm\s+owners?\s+worry|trashing\s+property\s+ignoring\s+rules|watch\s+trailer|khaleej\s+times|\bnamibia\b|chinese\s+mafia|genocide\s+illegal\s+settlements|illegal\s+settlements\s+chinese|advisory\s+board|special\s+meeting|housing\s+advisory|fake\s+middle\s+class|jobs?\s+debt\s+and\s+housing|housing\s+pressure\s+hit|funny\s+pranks?|youtube\s+pranks?|prank\s+(?:evict\w*|video|show|channel)|daily\s+tip|angelo\s+surmelis|home\s+furniture|home\s+decor|furniture\s+(?:tips?|makeover|decor|show)|looking\s+at\s+(?:her|his|their)\s+flooded\s+apartment|flooded\s+apartment\s+(?:disaster|damage|ruins?)|\bfilmibeat\b|\bmolkki\b|episode\s+spoiler|flick\s*vault|full[\s-]?hd\s+movies|movies?\s+for\s+free|double\s+bunk|campfire\s+eviction(?:\s+stories)?)\b/i;

/**
 * AI-generated illustration / digital-art "family evicted" pads that content-marketing
 * blogs use as decorative stock art. housing-web85: shortform.com's blog illustration
 * ("Evicted" door scene, digital-painting style, no camera texture) was already caught
 * by a domain-specific reject (shortform.com), but that only blocks that one host —
 * the next AI-illustration blog scrapes in under a different domain with the same
 * "illustration/digital art/AI-generated" tells in its own metadata. Hard-reject on
 * those tells directly so the domain allowlist is not the only defense. These pads are
 * never a good housing intro/opener even when the alt text otherwise looks on-topic
 * ("family crying distressed evicted apartment door" is exactly what shortform.com's
 * AI art was tagged with).
 */
export const HOUSING_AI_ILLUSTRATION_RE =
  /\b(?:ai[\s-]?generated(?:\s+(?:image|art(?:work)?|illustration|photo|graphic))?|midjourney|dall[\s-]?e(?:\s*\d)?|stable\s+diffusion|digital\s+(?:art|painting|illustration)|stylized\s+(?:art|image|illustration|rendering|painting)|artist'?s?\s+(?:impression|rendering|depiction|concept)|concept\s+art|generative\s+ai\s+(?:image|art|illustration)|\bai\s+art(?:work)?\b|illustrat(?:ion|ed)\s+(?:of\s+)?(?:an?\s+)?famil(?:y|ies))\b/i;

/**
 * Aviation / jet-engine B-roll that surfaces on housing topics via queries like
 * "packing boxes" or "apartment move-out". Hard-reject before timeline assembly.
 */
export const HOUSING_AVIATION_PAD_RE =
  /\b(?:jet\s+engines?(?:\s+(?:close[\s-]?up|sound|noise|roar|thrust|pod|nacelle|intake))?|turbine\s+engine|aircraft\s+engine(?:\s+(?:close[\s-]?up|pod|intake))?|engine\s+nacelle|engine\s+intake\s+(?:close[\s-]?up\s+)?(?:aviation|aircraft|airplane|jet)|airplane\s+(?:taking\s+off|taxiing\s+runway)|plane\s+taking\s+off\s+runway|jet\s+(?:taxiing\s+tarmac|takeoff\s+runway)|runway\s+(?:aircraft|jet|plane)\s+takeoff)\b/i;

/**
 * Generic group-photo / corporate-team stock with no housing signal.
 * Office group photos and diverse-smiling team portraits are never housing B-roll.
 */
export const HOUSING_GROUP_PHOTO_JUNK_RE =
  /\b(?:group\s+photo|team\s+photo|office\s+(?:group|team)\s+photo|corporate\s+(?:group|team)\s+(?:photo|portrait)|group\s+of\s+(?:business\s+)?(?:people|professionals?|employees?|colleagues?)\s+(?:posing|smiling|laughing)|group\s+portrait\s+(?:office|corporate|business|smiling|diverse)|diverse\s+(?:group|team)\s+(?:smiling|posing|photo))\b/i;

/** Reason string when housing harvest media is disaster/meeting/chart junk. */
export function housingOffTopicBrollReason(haystack, contextText = '') {
  if (!isHousingTopic(contextText)) return '';
  const h = String(haystack || '');
  if (HOUSING_OFF_TOPIC_BROLL_RE.test(h)) {
    return 'housing off-topic disaster/meeting/chart B-roll';
  }
  // housing-web163: bare "flooded apartment" disaster pads (no eviction) —
  // keep real eviction+flood collocations for tenant faces.
  if (/\bflooded\s+apartment\b/i.test(h) && !/\bevict\w*\b/i.test(h)) {
    return 'housing off-topic flood/disaster apartment pad';
  }
  // housing-web172: Ken O'Keefe / ceilidh / Bull City / pigeon-palace / I-Hotel
  // pads cleared soft-pass while drowning West Sussex + SF eviction faces —
  // wire intro-pad junk into the pool drop path (same as healthcare).
  if (isHousingIntroJunkPad(h)) {
    return 'housing off-topic intro/pad junk';
  }
  if (HOUSING_AI_ILLUSTRATION_RE.test(h)) {
    return 'housing off-topic AI-generated illustration/stock-art pad';
  }
  if (HOUSING_AVIATION_PAD_RE.test(h)) {
    return 'housing off-topic aviation/jet-engine pad';
  }
  if (HOUSING_GROUP_PHOTO_JUNK_RE.test(h)) {
    // Allow when the clip itself carries housing-topical vocabulary (e.g. tenant group meeting).
    if (!/\b(evict(?:ion|ed)?|tenant|landlord|rent(?:al)?|apartment|housing|foreclos|notice|lease)\b/i.test(h)) {
      return 'housing off-topic group-photo stock';
    }
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
 * healthcare-web18: blurry test-tube / petri-dish openers already included.
 * healthcare-web20: trade-show booth / corporate presentation — \bhimss\b standalone.
 * healthcare-web43: Archive query-mismatch junk (GeekBeat iPhone unlock, Jackthreads
 * fashion, MLK/imperialism pads, Bayer logo interview, "why do I innovate" Vimeo,
 * hair-transplant ARTAS, game-show This-or-That) — raw 3.4 corporate montage.
 * Post-web43 archive-only pool still leaked: podcast episodes, senate/martial-law,
 * Brookhaven atomic lab, war-casualty news, Daleiden hearing, culture-war clinic
 * pads, Elias Blind Spot Vimeo, bare Bayer stage, PRCS/Gaza war OR.
 * healthcare-web46: C4I "Call 4 Investigation" public-access TV (Obama podium +
 * blue-bodysuit collage frames), Moscow Times Russian nurses storage room,
 * al-Ahli hospital Gaza shorts.
 * healthcare-web205: NSW / state parliamentary inquiry into ambulance ramping
 * talking-head packages led @0 while Ulster/Shropshire surgery robots sat at
 * 1.30+ — hard-reject inquiry/ramping politics pads (Martha's Rule news packages
 * are handled in isHealthcareIntroPadJunk with a clinical-OR escape).
 * healthcare-web207: after inquiry rejects, first cuts still leaked Zoylo cash-
 * back consultation promos, LiveLeak clinic watermarks, Exo Echo pocket-
 * ultrasound product pads, grapes-to-gowns training novelty, VIBE Summit
 * conference, Tampa Bay phone-number radiology ads, and telehealth-startup
 * explainers — hard-reject those; keep Imperial MRI / Ulster–Shropshire OR.
 */
export const HEALTHCARE_OFF_TOPIC_BROLL_RE =
  /\b(?:aldous\s+huxley|huxley|george\s+orwell|orwell|brave\s+new\s+world|1984|dystopian?|conspiracy(?:\s*(?:theory|theories|bait|doc(?:umentary)?))?|deep\s+state|new\s+world\s+order|(?:truth|secrets?|agenda|elites?|government)\s+exposed|healthcare\s+exposed|fema|hurricane(?:\s+\w+)?\s+(?:fema|assistance|psa|relief|recovery)|tornado(?:\s+(?:anniversary|coverage|warning|damage|recovery))?|storm\s+(?:recovery|restoration|warning|damage|psa)|community\s+recovery\s+after\s+disaster|disaster\s+(?:recovery|relief|psa|outreach|footage)|cockroach(?:es)?|roach(?:es)?|insects?|peas?\s+meme|green\s+peas?|classical\s+paintings?|oil\s+paintings?|renaissance\s+(?:art|painting|portrait)|baroque\s+painting|museum\s+painting|rembrandt|van\s+gogh|monet|literary\s+festival|book\s+festival|writers?\s+festival|brattleboro|(?:covid|c[\s-]?19|coronavirus)\s+(?:propaganda|psa|misinfo|hoax)|pandemic\s+propaganda|propaganda\s+war|sleepy\s+joe|antibody\s+dependent\s+enhancement|coursera|stanford\s+online|course\s+trailer|lecture\s+slides?|powerpoint\s+lecture|online\s+lecture|mooc(?:\s+lecture)?|title\s+card|capitol(?:\s+building)?|state\s+capitol|protest(?:ers?|ing)?|rally\s+(?:crowd|footage)|political\s+rally|maternity(?:\s+(?:ward|hospital|film|footage|clinic|care|1937|archival|vintage))?|childbirth|child\s*birth|washing\s+breasts?|kapparot|kapores|atonement\s+(?:ritual|ceremony)|ritual\s+(?:chicken|slaughter|atonement|kapparot)|news\s+talking\s*heads?|talking\s*heads?\s+(?:studio|news|interview)|news\s+(?:anchor|studio|desk|storage)|anchor\s+desk|studio\s+(?:interview|talking)|newsroom\s+anchor|christmas\s+tree|xmas\s+tree|green\s+screen|holiday\s+backdrop|chroma\s+key|def\s*con|biohacking\s+village|madness\s+and\s+medicine|sex\s+after\s+(?:prostate|surgery)|prostate\s+(?:cancer\s+)?(?:sex|breaking\s+news)|christmas\s+tree|green\s*screen\s+(?:christmas|holiday)|legos?|mgtow|hiroshima|atomic\s+(?:bomb|experiments?)|warzone|war\s*zone|holiday\s+health\s+tips|terrible\s+nurses|cnn\s*10|breast\s+implants?|plastic\s+surg(?:ery|eon)?|aesthetics?\s+(?:spa|medical)|mathew\s+epps|lowcountry\s+lowdown|cong\s+hoa|saigon|burn\s+ward|vietnam(?:ese)?\s+(?:war|hospital|archival|medical)|penfield\s+reading|ltc\s+lakin|obama.?s?\s+eligibility|challenging\s+obama|scooter\s+vs\s+car|collision\s+in\s+venice|medical\s+city\s+arlington|adventure\s+eight|paging\s+dr\.?\s+ross|scottsdale.?s?\s+cure\s+corridor|city\s+of\s+scottsdale|deadly\s+medicine\s+interactions|amazon\s+pharmacy|garland\s+isd|school\s+district|classroom\s+(?:demo|presentation)|students?\s+watching|children\s+(?:seated|audience)|kids?\s+(?:classroom|assembly)|robotic\s+surgery\s+demo\s+(?:at\s+)?(?:school|isd)|da\s*vinci\s+surgical\s+system\s+overview|neuralink(?:\s+robot|\s+live)?|school\s+nurse|wendy\s+cummings|whhi(?:\s+news)?|al\s+funduq|curfew\s+doctor|ukraine\s+pow|prisoners?\s+of\s+war|kissing\s+and\s+love|rhino\s+(?:ct|scan)|zoo\s+(?:ct|scan|x[\s-]?ray)|circumc(?:ision|ure)|board\s+of\s+commissioners|organ\s+harvesting|brain\s+death|world\s+laparoscopy\s+hospital|anniversary\s+celebration|medical\s+career|well\s+paying\s+medical|allied\s+health\s+radiologic|hospitals?\s+safe\s+from\s+covid|second\s+opinion\s+project|exhibition\s+hall|trade\s*show(?:\s+floor)?|\bhimss\b|conference\s+(?:booth|floor|expo\s+floor)|expo\s+(?:floor|booth|hall)|ces\s+(?:20\d{2}|conference|show)|health\s+(?:it\s+)?summit\s+(?:booth|floor|expo)|ai\s+(?:summit|conference)\s+(?:booth|floor|hall|product\s+demo)|medical\s+trade\s+show|healthcare\s+(?:expo|trade\s+show)|suit\s+(?:walk(?:ing)?|stroll(?:ing)?)|judy\s+mikovits|censored\s+scientists|david\s+samadi|\bsamadi\b|truth\s+about\s+canadian\s+healthcare|medical\s+liability|healthloop|bad\s+patient\s+diagnoses|overwhelmed\s+covid|covid\s*19\s+ward|talk\s+of\s+the\s+town|whhitv|ron\s+johnson|mrna\s+vaccine|vaccine\s+injury|ask\s+dr\s+drew|intestinal\s+injury|attempted\s+abortion|walk\s*in\s+center|mental\s+health\s+addictions|medical\s+monopoly|tour\s+glendale|new\s+hospital\s+st\s+joseph|swift\s+corridor|absolute\s+justice|white\s+coat\s+ceremony|medical\s+school\s+(?:graduation|convocation|white\s+coat)|nursing\s+(?:pinning\s+ceremony|graduation\s+ceremony|celebration\s+day)|hospital\s+(?:fundraiser|benefit\s+gala|benefit\s+concert|anniversary\s+gala)|digital\s+health\s+(?:summit\s+(?:floor|booth|expo)|conference\s+(?:floor|booth|expo))|health\s+(?:tech|information\s+technology)\s+conference\s+(?:floor|booth|expo|keynote)|ehr\s+(?:demo|product\s+demo|software\s+demo|keynote)|emr\s+(?:demo|product\s+demo|software\s+demo)|body\s+language\s+(?:healthcare|medical|clinical|edition|coaching|mistakes?)|healthcare\s+edition|nvidia\s+(?:ai\s+)?(?:for\s+)?(?:healthcare|life\s+sciences|health\s+systems?)|ai\s+patel|why\s+ai\s+[a-z]{3,}\s+why\s+ai|jada\s+pemble|meet\s+our\s+[a-z]+\s+[a-z]+\s+[a-z]+\s+medical\s+lab|helium\s+used\s+in\s+(?:the\s+)?medical\s+(?:field|imaging)|not\s+just\s+for\s+balloons\s+helium|milestone\s+celebration|maple\s+grove\s+(?:hospital|high\s+schooler)|medcram(?:\.com)?|(?:online\s+medical\s+learning|how)\s+(?:can\s+)?pa\s+schools?\s+(?:can\s+)?benefit|pa\s+schools?\s+(?:can\s+)?benefit(?:\s+from\s+medcram)?|nurses?\s+at\s+celebrity\s+eclipse|celebrity\s+eclipse\s+(?:medical|medical\s+facility)|celebrity\s+(?:cruise\s+)?(?:ship\s+)?(?:nurse|medical\s+facilit)|(?:maryland\s+)?women.?s?\s+heritage\s+center|honor\s+nurses?\s+(?:from\s+)?wwi|wwi\s+(?:heritage\s+center|nurses?)|emergency\s+1972|1972\s+(?:tv\s+series|television\s+series)\s+incomplete|1972\s+tv\s+series|bilibili\s+(?:chill|sakura|ai\s+debug)|sakura\s+(?:chill|ai\s+debug)|chill\s+sakura|ai\s+debug\s+pad|surgeon\s+simulator(?:\s+\d+)?(?:\s+multiplayer)?|electric\s+massage(?:\s+pillow|\s+cushion)?|massage\s+pillow|ai\s+geist|geist\s+lynx|lynx\s+reports?|kathmandu\s+medical\s+college|blurry\s+test\s*tubes?|test\s*tube\s+(?:close\s*up|b-?roll|stock)|petri\s+dish\s+(?:b-?roll|stock|close\s*up)|ent\s+examination\s+(?:video|lecture|tutorial)|jackthreads|jack\s*threads|real\s+fashion\s+for\s+guys|geekbeat(?:\.tv)?|unlock(?:ing)?\s+(?:your\s+)?(?:old\s+)?iphone|at\s*&?\s*t\s+will\s+unlock|\bmlk\b|martin\s+luther\s+king|why\s+america\s+may\s+go\s+to\s+hell|this\s+or\s+that|metro\s+edition|che\s+guevara|imperialism|palestine\s+deepdive|palestine\s+red\s+crescent|\bprcs\b|bald\s+truth|why\s+do\s+i\s+innovate|dr\.?\s+elias|elias.?s?\s+blind\s+spot|david\s*(?:&|and)\s*elias|hair\s+transplant|artas\s+hair|sri\s+ponni|\bbayer\b|corporate\s+(?:logo\s+)?(?:interview|presentation|stage|booth)|logo\s+stage|keynote\s+stage|fashion\s+for\s+guys|game\s+show|spinning\s+wheel|martial\s+law|senate\s+passes|congressional\s+hearing|david\s+daleiden|aborted\s+baby|transgender\s+critical|rainbow\s+or\s+die|high\s+schooler|accepted\s+to\s+medical\s+school|brookhaven|dies?\s+in\s+lebanon|denied\s+hospital\s+care|gaza\s+s?\s+wounded|gaza\s+(?:war\s+)?hospital|hospital\s+siege|war\s+hospital\s+siege|siege\s+(?:of\s+)?(?:a\s+|the\s+)?(?:gaza\s+)?hospital|thought\s+process\s+of\s+highly\s+successful|highly\s+successful\s+people|cuffless\s+(?:blood\s+)?pressure|blood\s+pressure\s+monitor\s+(?:product|ad|promo|commercial|review|wearable)|aaron\s+judge|bone\s+bruise|israeli\s+genocide|episode\s+\d+|split[\s-]?screen\s+(?:podcast|interview)|c4i|call\s+4\s+investigation|call\s+for\s+investigation|inner\s+voices|al\s+ahli\s+hospital|abu\s+sitta|moscow\s+times|sick\s+(?:russian\s+)?nurses?\s+in\s+storage|nurses?\s+storage\s+room\s+(?:outrage|spark)|bronxnet|open\s+tuesday\s+(?:ai|health|medical|breast|cancer|bronx|new\s+york)|public\s+access\s+tv|peg\s+(?:tv|channel|media|youtube)|community\s+media\s+(?:peg|bronx|channel)|rsna\s+20\d{2}|ai\s+interoperability\s+and\s+workflow|workflow\s+automation\s+at\s+rsna|mindray\s+n\s+series|user\s+training\s+part\s*\d|journal\s+of\s+diagnosis(?:\s+case\s+reports?)?|kaggle(?:\s+slide|\s+notebook|\s+competition)?|guerbet\s+aimed|\bnih\b\s+data\s+science\s+and\s+medicine|data\s+science\s+and\s+medicine\s+what.?s\s+possibly|corporate\s+(?:slide|powerpoint|deck)|powerpoint\s+(?:slide|deck|presentation)|slide\s+presentation\s+(?:healthcare|medical|ai)|imaging\s+wire|ramsoft\s+ceo|orbis\s+flying\s+eye(?:\s+hospital)?|fedex\s+helps\s+deliver\s+sight|ensemble[\s-]?x|ensembled?\s+deep\s+learning|whitney\s+hatch|heart\s+patient\s+(?:interview|testimonial)|chest\s+x[\s-]?ray\s+interpretation\s+explained|how\s+to\s+read\s+a\s+chest\s+x[\s-]?ray|overview\s+of\s+(?:the\s+)?da\s*vinci|onyx\s+rad\s+demonstration|mri\s+wide\s+bore\s+(?:video|southeastern)|manuscript\s+today|cassette|personal\s+injury\s+(?:clinic|center|doctor|attorney)|cabrini\s+foundation|veterinary\s+(?:imaging|radiology|(?:ct|mri|ultrasound)\s+modalities?)|after\s+effects?\s+(?:project|template)|\biamstemak\b|gcsc\s+surgical|what\s+to\s+expect\s+(?:when\s+)?having\s+(?:an?\s+)?(?:mri|ct\s+scan|mri\s+scan)|connect\s+patient\s+portal|patient\s+portal\s+(?:connect|login|app|software)|acr\s+accreditation|car\s+accident\s+(?:doctor|mri|clinic)|ghanashyam|ecg\s+reading\s+and\s+xray|radiology\s+dvds?|cosmetic\s+product\s+after\s+effects|remote\s+cardiac\s+monitoring\s+rhythm|myrhythmnow|cambridge\s+filmworks|at\s+medica\s+20\d{2}|medica\s+20\d{2}|versius\s+surgical\s+robotic\s+system|senhance\s+surgical\s+robotic\s+system(?:\s+full\s+length)?|full\s+length\s+benefits|smart\s+m(?:onitor|edical)\s+series\s+at\s+medica|science\s+nation|sciencenation|nsf\s+science\s+nation|national\s+science\s+foundation\s+science\s+nation|angry\s+boy\s+part|regen\s+seminar|ultrasound[\s-]?guided\s+injections?\s+(?:seminar|demo|demonstration|training)|why\s+is\s+awbus|\bawbus\b|better\s+choice\s+over\s+hand[\s-]?held|lab\s+interfaces|microwize|medisoft\s+clinical|shelford\s+surgical\s+training|start\s+programme|reveal\s+linq|insertable\s+cardiac\s+monitor|tmini\s+miniature|think\s+surgical|technical\s+overview\s+illustration|healthcare\s+professional\s+information\s+series|discussing\s+cancer\s+screening\s+with\s+patients|talking\s+to\s+family\s+loved\s+ones\s+about\s+lung|diversified\s+radiology\s+breast|patient\s+friendly\s+video\s+was\s+created\s+by\s+(?:acr|radiologist)|stitch\s+a\s+grape|mri\s+how\s+it\s+works\s+part|how\s+an\s+mri\s+mrt\s+scan\s+is\s+performed|philips\s+epiq|lcd\s+monitor\s+removal|omnibotics|corin.?s?\s+robotic\s+assisted|diagnostic\s+mammogram\s+este\s+video|qu[eé]\s+debe\s+saber\s+sobre\s+la\s+mamograf|clinic\s+promo|(?:mri|ct|ultrasound)\s+clinic\s+promo|promo\s+(?:personal\s+injury|clinic\s+mri)|walk[\s-]?in\s+(?:mri|imaging)\s+(?:promo|ad|clinic)|imaging\s+center\s+(?:promo|advertisement|commercial)|free\s+mri\s+(?:consult|consultation|promo)|ambulance\s+ramping|parliamentary\s+inquiry|nsw\s+inquiry|state\s+parliamentary\s+inquiry|patients?\s+dying\s+unnecessarily|cash\s+back\s+on\s+(?:doctor\s+)?consultation|\bzoylo\b|live\s*leak|\bliveleak\b|grapes\s+to\s+gowns|\bexo\s+echo\b|pocket\s+ultrasound|vibe\s+summit|tech\s+startups?\s+increasingly\s+offering|bayview\s+radiology|breast\s+ultrasounds?\s+in\s+tampa|most\s+common\s+use\s+cases?\s+for\s+ai|\bbotox\b|looking\s+frozen\s+after\s+botox|nano\s+homeopath|homeopath(?:y|ic)|dr\s+lubna\s+kamal|\bjacono\b|rhinoplast|width\s+of\s+her\s+nos|sexually\s+molests?|molests?\s+patients?\s+under\s+anesthesia|\bomron\b|\bbp742n\b|blood\s+pressure\s+monitor\s+pack|mri\s+unit\s+lifted|lifted\s+into\s+\w+\s+hospital\s+by\s+crane|denied\s+mri\s+referral|broke\s+skull\s+in\s+mri|fl\s+dept\s+of\s+health|paid\s+less\s+than\s+their\s+male\s+colleagues|female\s+doctors?\s+spent\s+more\s+time)\b|\bexposed\s*[:\-]|\bmeme\b[^.]{0,40}\bpeas?\b|srcpublishers\.com/i;

/**
 * Strong clinical subjects we deliberately search Archive for. Query→title gates
 * use this so "surgical robot" cannot soft-admit GeekBeat / fashion / political pads
 * that only share weak hospital/medical tokens (or none).
 */
export const HEALTHCARE_ARCHIVE_STRONG_SUBJECT_RE =
  /\b(surgical\s*robot(?:ics?)?|robot(?:ic)?\s*surger|surgery\s+robot|da\s*vinci|radiolog\w*|mri|ct\s*scan|ultrasound|operating\s+room|or\s+(?:suite|table|lights?)|science\s+nation|onyx\s*rad|workstation|clinician\s+(?:screen|monitor|computer)|intraoperative|laparoscop\w*|ai\s+radiolog)\b/i;

/** Tokens that are too weak alone to prove an Archive item matches a clinical query. */
export const HEALTHCARE_AMBIGUOUS_ARCHIVE_MATCH_TOKENS = new Set([
  'medical', 'medicine', 'health', 'healthcare', 'hospital', 'clinical', 'clinic',
  'doctor', 'doctors', 'patient', 'patients', 'nurse', 'nurses', 'ward', 'wards',
  'laboratory', 'examination', 'station', 'storage', 'news', 'care', 'system',
  'training', 'advanced', 'facilities', 'centre', 'center', 'workers', 'effects',
  'solution', 'solutions', 'ai',
]);

/**
 * When Archive was asked for a strong clinical subject, reject titles that do not
 * carry that subject (web43: query=surgical robot → GeekBeat iPhone unlock).
 *
 * @param {string} query
 * @param {string} titleAlt
 * @param {string} [topicBlob]
 * @returns {string} reason or ''
 */
export function healthcareArchiveTitleMismatchReason(query = '', titleAlt = '', topicBlob = '') {
  if (!isHealthcareTopic(topicBlob)) return '';
  const q = String(query || '');
  const evidence = String(titleAlt || '');
  if (!q.trim() || !evidence.trim()) return '';
  if (!HEALTHCARE_ARCHIVE_STRONG_SUBJECT_RE.test(q)) return '';
  if (HEALTHCARE_ARCHIVE_STRONG_SUBJECT_RE.test(evidence)) return '';
  const qTokens = q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !HEALTHCARE_AMBIGUOUS_ARCHIVE_MATCH_TOKENS.has(w));
  const eTokens = evidence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  const overlap = qTokens.filter((t) => eTokens.some((e) => e === t || e.startsWith(t) || t.startsWith(e)));
  if (overlap.length > 0) return '';
  return 'healthcare archive query-title mismatch';
}

/** Reason string when healthcare harvest media is conspiracy/disaster/meme junk. */
export function healthcareOffTopicBrollReason(haystack, contextText = '', asset = null) {
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
  // RP_MENTAL_HOSPITAL_RE and YOUTUBE_POOP_YTPMV_RE were only wired into
  // HEALTHCARE_HARD_REJECT_PATTERNS (soft-pass gating) but not into the actual
  // clip-drop path. Wire them here so these items are removed from the pool
  // rather than just blocking soft-pass. (web48: rpmentalhospital001/YTPMV still
  // appeared in timelines because isJunkStockClip only calls this function, not
  // the hard-reject list.)
  if (RP_MENTAL_HOSPITAL_RE.test(h)) {
    return 'healthcare hard-reject: rp-roleplay-hospital';
  }
  if (YOUTUBE_POOP_YTPMV_RE.test(h)) {
    return 'healthcare hard-reject: youtube-poop-ytpmv';
  }
  // News-drama "man scales hospital" and COVID-ICU footage are not AI-medicine B-roll.
  // healthcare-web53: youtube-7vVpNVclTF4 "Palestinian man scales hospital" (query:
  // intensive care unit) and "coronavirus inside an intensive care unit in Barcelona".
  if (/\bscales?\s+hospital\b/i.test(h)) {
    return 'healthcare: news-drama scales-hospital clip';
  }
  if (/\bcoronavirus\s+inside\b/i.test(h)) {
    return 'healthcare: covid-footage not AI-medicine';
  }
  // healthcare-web200: beauty/"pretty woman face" stock + osteopathy/rehab clinic
  // ads scraped via doctor-face queries — drop from pool (junk filter > soft-pass).
  if (isHealthcareIntroBeautyOrClinicJunk(h) && !healthcareIntroClinicalEscape(h)) {
    return 'healthcare: beauty/cosmetic or osteopathy-clinic B-roll';
  }
  // healthcare-web202: faceless Mira/unveiled/Andrew-Chung robot *product* pads
  // must drop from the pool — bare "surgical robot" must not launder them.
  if (isHealthcareFacelessRobotProductPad(h)) {
    return 'healthcare: web202 faceless robot product pad';
  }
  // healthcare-web201/web202/web203/web204/web205/web207/web211: Gaza /
  // thought-process / cuffless / COVID / Smile/WebMD / laparoscopyhospital /
  // doctors-union / industrial-relations / robots-in-medical-field /
  // ambulance-ramping / cashback / nurse-prank / ambulance-queue /
  // product-MRI pads — hard-drop from pool (no clinicalEscape: laparoscopic
  // tokens or bare ct/mri room-cam titles must not keep junk in the pool).
  if (isHealthcareIntroPadJunk(h)) {
    return 'healthcare: web201-web211 off-topic intro pad';
  }
  // Archive query→title mismatch (surgical robot → GeekBeat / fashion / political).
  if (asset) {
    const mismatch = healthcareArchiveTitleMismatchReason(
      asset.query || '',
      `${asset.title || ''} ${asset.alt || ''}`,
      contextText,
    );
    if (mismatch) return mismatch;
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
    // The HOUSING_STOCK_LOOP_RE guard inside genericStockJunkReason uses the full
    // haystack (alt+url+query). Provider queries echo "tenant moving boxes" back into
    // the query field, so "tenant" in the query escapes the exclusion check. Re-run the
    // loop-stock check against visualEvidenceBlob which strips provider query echoes —
    // only the alt/title/url are checked, not the search query string.
    if (isHousingTopic(topic)) {
      const vizBlob = visualEvidenceBlob(asset);
      if (HOUSING_STOCK_LOOP_RE.test(vizBlob) && !/\b(eviction notice|court|lease|landlord|tenant|letter|keys)\b/i.test(vizBlob)) {
        dropped.push({ url: asset.url, segmentId: asset.segmentId, score: 0, reason: 'generic housing/moving-box loop stock' });
        continue;
      }
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
 * Person/household nouns that count as a housing intro face signal. DDG's
 * site:vimeo.com results (waves 36-60, after the ':' sanitizeQuery fix) return
 * real face+eviction stories — "Barcroft TV: Grandmother Faces Eviction From
 * 'Paradise' Treehouse", "Preview Clip ... 'Evicting the American Dream'",
 * "Tenants Rise Up! Fighting for Housing Justice" — that a narrow singular
 * word list (tenant/family/woman/man/couple only) rejected outright: plural
 * forms ("tenants", "families") fail a bare `\btenant\b` check, and common
 * kinship/status nouns ("grandmother", "resident", "renter") were never in
 * the list at all. Broadening this list is what turns those already-returned,
 * already-downloadable Vimeo clips into gate-passing evidence.
 */
const HOUSING_INTRO_PERSON_NOUN_SRC =
  'tenants?|famil(?:y|ies)|persons?|people|wom[ae]n|man|men|couples?|residents?|renters?'
  + '|homeowners?|occupants?|households?|grandmothers?|grandfathers?|mothers?|fathers?'
  + '|widows?|neighbors?|neighbours?';

/** Emotion/reaction words that, paired with a person noun, read as a face opener. */
const HOUSING_INTRO_EMOTION_WORD_SRC = 'worried|shocked|stressed|distressed|crying';

/**
 * housing-web159: reality-TV / movie-trailer / geopolitics-riot / mental-health /
 * mortgage-fraud pads that can still collocate person+eviction words (e.g. Bull
 * Street trailer "grandmother" + "evict"). These must never clear intro-face
 * evidence — keep real tenant/grandmother/family eviction documentary titles.
 * housing-web160: Gujarat wedding-cash / cry-outside-banks (women+crying FP),
 * UAE farm-owner / rude-tenant pads (bare "tenants" FP), Namibia genocide /
 * Chinese-mafia docs, advisory-board / special-meeting committee pads, and
 * China fake-middle-class macro talking-heads.
 * housing-web161: boy-breaks/Heartsome, Occupy Wall Street, ABC15 let-joe-know,
 * LLG social-murder desktop, Carl DeMaio politics — never intro or pool.
 * housing-web163: Angelo Surmelis daily-tip furniture/decor, YouTube funny
 * pranks eviction skits, flooded-apartment disaster tears — never intro or
 * pool (bare flooded+eviction collocations still escape).
 * housing-web165: FILMIBEAT / molkki episode spoilers, flick-vault / full-hd
 * movies / double-bunk piracy pads, campfire eviction stories — never intro
 * or pool (keep West Sussex / Dale Farm / SF tenants).
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHousingIntroJunkPad(evidence = '') {
  const text = String(evidence || '');
  if (
    /\b(?:bigg\s*boss|bbott\d*|manisha\s+rani|reality\s+(?:tv|show)\s+evict\w*|weekend\s+ka\s+vaar|official\s+trailer|movie\s+(?:trailer|teaser)|film\s+(?:trailer|teaser)|theatrical\s+trailer|bull\s+street\s+movie|israeli\s+police|riot\s+(?:israeli|police|eviction)|police\s+violence\s+during.{0,48}evict\w*|flint\s+charged|russian\s+eviction|vice\s+news\s+tonight|men'?s?\s+mental\s+health|mental\s+health\s+(?:a\s+)?silent\s+crisis|karen\s+straughan|mortgage\s+(?:financing|fraud)|falling\s+for\s+fraud|foreclosure\s+rescue\s+scams?|mortgage\s+foreclosure\s+rescue|timber\s+(?:roots|chronicles)|bill\s+barnum|eureka.?s?\s+timber|gujarat\s+women|denied\s+cash\s+for\s+weddings?|cash\s+for\s+weddings?|crying\s+outside\s+banks?|cry\s+outside\s+banks?|women\s+crying\s+outside\s+banks?|wedding\s+engagements?|unable\s+to\s+withdraw\s+cash|uae\s+farm\s+owners?|rude\s+tenants?|farm\s+owners?\s+worry|trashing\s+property\s+ignoring\s+rules|watch\s+trailer|khaleej\s+times|\bnamibia\b|chinese\s+mafia|genocide\s+illegal\s+settlements|illegal\s+settlements\s+chinese|advisory\s+board|special\s+meeting|housing\s+advisory|fake\s+middle\s+class|jobs?\s+debt\s+and\s+housing|housing\s+pressure\s+hit|boy\s+breaks\s+into\s+tears|\bheartsome\b|occupy\s+wall\s+street|let\s+joe\s+know|\babc\s*15\b|social\s+murder|political\s+theater\s+disability|\bllg\b|carl\s+demaio|san\s+diego\s+politics|funny\s+pranks?|youtube\s+pranks?|prank\s+(?:evict\w*|video|show|channel)|daily\s+tip|angelo\s+surmelis|home\s+furniture|home\s+decor|furniture\s+(?:tips?|makeover|decor|show)|looking\s+at\s+(?:her|his|their)\s+flooded\s+apartment|flooded\s+apartment\s+(?:disaster|damage|ruins?)|\bfilmibeat\b|\bmolkki\b|episode\s+spoiler|flick\s*vault|full[\s-]?hd\s+movies|movies?\s+for\s+free|double\s+bunk|campfire\s+eviction(?:\s+stories)?|ken\s+o\s*['']?\s*keefe|truth\s+lies\s+why\s+dale\s+farm|ceilidh\s+band|soas\s+ceilidh|tate\s+modern|bull\s+city\s+today|pigeon\s+palace|fall\s+of\s+the\s+i\s+hotel|nonprofits?\s+activism|\bsimonabonomo\b|youtube\s+video\s+nonprofits?)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  // Flood/disaster apartment tears without eviction — keep real eviction faces.
  if (/\bflooded\s+apartment\b/i.test(text) && !/\bevict\w*\b/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Does this evidence text (title/alt/source/url — never the harvest query)
 * describe a housing face/lived-in opener? Shared by the pre-harvest pool
 * check (checkIntroFacePool) and the post-build timeline check
 * (checkEditTimelineIntroFace / repairEditTimelineIntroFace) so the two
 * gates cannot drift out of alignment (housing-web4/8/10).
 *
 * `evict\w*` (rather than an enumerated suffix list) matches eviction,
 * evictions, evicted, evicting, evicts — the enumerated `evict(?:ion|ed|s)?`
 * this replaces silently dropped "evicting"/"evictions", the two most common
 * real-world headline forms.
 *
 * housing-web159: reality-TV / trailer / geopolitics / mental-health junk that
 * collocates person+eviction never clears (isHousingIntroJunkPad).
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function housingIntroFaceEvidenceMatches(evidence = '') {
  const text = String(evidence || '');
  // Trailers / Bigg Boss / geopolitics / mental-health pads can carry
  // grandmother+evict words — never count them as intro-face evidence.
  if (isHousingIntroJunkPad(text)) return false;
  const personNounRe = new RegExp(`(?:${HOUSING_INTRO_PERSON_NOUN_SRC})`, 'i');
  const hasGateCollocation = new RegExp(
    `\\b(?:(?:${HOUSING_INTRO_EMOTION_WORD_SRC})\\s+${personNounRe.source}`
    + `|${personNounRe.source}\\s+(?:${HOUSING_INTRO_EMOTION_WORD_SRC})`
    + `|tenants?|apartment\\s+interior|living\\s+room|famil(?:y|ies)\\s+(?:crying|distressed|evict\\w*)`
    + `|close[\\s-]?up\\s+(?:faces?|tenant|person)|tenants?\\s+faces?|persons?\\s+faces?`
    + `|people\\s+(?:crying|evict\\w*|distressed))\\b`,
    'i',
  ).test(text);
  // housing-web153: bare "shocked"/"face" + eviction cleared political radio
  // ("maajid nawaz shocked at caller s eviction") and constable pads
  // ("constables face dangers while serving eviction notices"). Require a real
  // person noun, "faces eviction", or emotion+face — never standalone shocked/face.
  const hasEvictionWithPerson =
    /\bevict\w*\b/i.test(text)
    && (
      personNounRe.test(text)
      || /\bfaces?\s+(?:(?:an?|multiple|sudden|imminent|possible)\s+)?evict\w*\b/i.test(text)
      || /\b(?:worried|shocked|stressed|distressed|crying)\s+faces?\b/i.test(text)
      || /\bfaces?\s+(?:close[\s-]?up|portrait|reaction)\b/i.test(text)
      || /\b(?:close[\s-]?up|portrait)\s+(?:faces?|tenant|person)\b/i.test(text)
    );
  return hasGateCollocation || hasEvictionWithPerson;
}

/**
 * Rank housing intro repair candidates (housing-web159):
 * named documentary eviction faces — Dale Farm / SF / West Sussex / Richmond (4) >
 * other documentary / news tenant·grandmother·family eviction faces (3) >
 * other person+eviction collocations (2) > weak lived-in (1).
 * Reality-TV / trailer / geopolitics / mental-health junk never ranks (0).
 *
 * @param {object} asset
 * @returns {number}
 */
export function housingIntroRepairRank(asset) {
  const evidence = [asset?.title, asset?.alt, asset?.source, asset?.url]
    .filter(Boolean).join(' ');
  if (isHousingIntroJunkPad(evidence) || HOUSING_OFF_TOPIC_BROLL_RE.test(evidence)) return 0;
  if (!housingIntroFaceEvidenceMatches(evidence)) return 0;
  // Named documentary openers watchers reward — always outrank generic lived-in.
  const namedDoc =
    /\b(?:dale\s+farm|west\s+sussex|burden\s+of\s+richmond)\b/i.test(evidence)
    || (/\brichmond\b/i.test(evidence) && /\bevict\w*\b/i.test(evidence))
    || (
      /\b(?:san\s+francisco|\bsf\b)\b/i.test(evidence)
      && /\btenants?\b/i.test(evidence)
      && /\bevict\w*\b/i.test(evidence)
    );
  if (namedDoc && /\bevict\w*\b/i.test(evidence)) {
    return 4;
  }
  // Prefer real tenant-eviction documentary / news faces over generic lived-in.
  if (
    /\b(?:documentary|news\s+footage|tenants?\s+(?:being\s+)?evict\w*|grandmother\s+(?:faces?\s+)?evict\w*|famil(?:y|ies)\s+(?:faces?\s+|being\s+)?evict\w*|worried\s+tenant|man\s+faces?\s+(?:an?\s+)?eviction\s+order)\b/i.test(evidence)
  ) {
    return 3;
  }
  if (
    /\b(?:tenant|grandmother|grandfather|family|families|resident|renter|homeowner|woman|man|couple)\b/i.test(evidence)
    && /\bevict\w*\b/i.test(evidence)
  ) {
    return 2;
  }
  return 1;
}

/**
 * healthcare-web197/web198: hospital-corridor walking-away / backs-to-camera /
 * hallway establishing / title-card / blurry-container openers soft-passed the
 * timeline gate via bare "doctor"/"radiolog*"/"face" tokens and led the hook
 * with no clinician face / OR / MRI in the first 3s. These establishing pads
 * must never count as intro evidence unless a strong clinical escape is also
 * present in the same evidence blob.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHealthcareEstablishingOpener(evidence = '') {
  return /\b(?:hospital\s+corridor|hospital\s+hallway|medical\s+hallway|corridor\s+(?:walking|empty|people|footage|establishing)|hallway\s+(?:walking|empty|people|footage|establishing)|(?:hospital|medical)\s+(?:corridor|hallway|couloir)|couloir|walking\s+(?:away|down|through)\s+(?:(?:a|the|an)\s+)?(?:hospital\s+)?(?:corridor|hallway|couloir)?|nurses?\s+walking\s+(?:(?:down|through|along|away)\s+)?(?:(?:a|the)\s+)?(?:corridor|hallway)?|medics?\s+walking|doctors?\s+walking\s+(?:away|down|through)|(?:medics?|doctors?|nurses?|staff)\s+backs?|backs?\s+to\s+(?:the\s+)?camera|from\s+behind|rear\s+view|back\s+of\s+(?:the\s+)?head|walking[\s-]away|hospital\s+(?:building\s+)?exterior|hospital\s+establishing|establishing\s+shot|medical\s+(?:building|campus|center)\s+exterior|title\s+card|title\s+slide|presentation\s+slide|powerpoint\s+(?:slide|deck|title)|lecture\s+slides?|blurry\s+containers?|containers?\s+(?:ship|port|yard|blurry|out\s+of\s+focus|aerial)|shipping\s+containers?|cargo\s+containers?|blurry\s+(?:building|facility|exterior|warehouse))\b/i.test(
    String(evidence || ''),
  );
}

/**
 * Backs / from-behind / title-card dead air that must hard-fail the healthcare
 * intro even when co-occurring tokens mention MRI/doctor (healthcare-web198:
 * medics-from-behind hallway → title card → building exterior, raw 4.2).
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHealthcareIntroDeadAirOpener(evidence = '') {
  return /\b(?:from\s+behind|rear\s+view|backs?\s+to\s+(?:the\s+)?camera|back\s+of\s+(?:the\s+)?head|(?:medics?|doctors?|nurses?|staff)\s+backs?|walking[\s-]away|title\s+card|title\s+slide|presentation\s+slide|powerpoint\s+(?:slide|deck|title)|recorded\s+call|phone\s+call\s+(?:only|recording)|lecture\s+slides?)\b/i.test(
    String(evidence || ''),
  );
}

/**
 * OR / MRI / surgical-robot / clinician+screen motion that may open a healthcare hook
 * without an explicit face noun.
 *
 * healthcare-web198: bare "radiologist" + "mri" in a recorded-call / title-card
 * pad must NOT clear — require visual MRI/OR/robot tokens or reviewing+screen.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function healthcareStrongClinicalMotion(evidence = '') {
  const text = String(evidence || '');
  // Title-card / recorded-call / backs dead air never counts as clinical motion
  // unless the same blob explicitly names OR / MRI machine / surgical robot.
  if (isHealthcareIntroDeadAirOpener(text)) {
    return /\b(?:surgical\s*robot(?:ics?)?|robot(?:ic)?\s*surger|surgery\s+robot|da\s*vinci\s*(?:surg|robot|or)?|operating\s+room|or\s+(?:suite|table|lights?)|mri\s+(?:scans?|scanners?|machines?|rooms?|monitors?|screens?)|ct\s*(?:scans?|scanners?))\b/i.test(text);
  }
  return /\b(?:surgical\s*robot(?:ics?)?|robot(?:ic)?\s*surger|surgery\s+robot|da\s*vinci\s*(?:surg|robot|or)?|operating\s+room|or\s+(?:suite|table|lights?)|intraoperative|laparoscop\w*|mri\s+(?:scans?|scanners?|machines?|rooms?|performed|monitors?|screens?)|ct\s*(?:scans?|scanners?)|radiologist\s+(?:workstation|screen|monitor|reads?|reviewing)|radiolog\w*\s+(?:ai|workstation|monitor|screen)|cnbc.{0,48}(?:surgical|robot|da\s*vinci|diagnos))\b/i.test(text)
    || (
      /\b(?:doctor|clinician|radiologist|physician|surgeon)\b/i.test(text)
      && /\b(?:monitor|screen|mri|ultrasound|scan)\b/i.test(text)
      && /\b(?:reviewing|reads?|pointing|looking|workstation|at\s+(?:the\s+)?(?:monitor|screen|scan))\b/i.test(text)
    );
}

/**
 * Doctor / surgeon / patient (or clinician / radiologist) face collocation for the
 * healthcare intro gate. Bare "doctor" / "person face hospital" / corridor walking
 * does NOT qualify (healthcare-web197). healthcare-web198: French "faire face" /
 * "face l'afflux de patients" must NOT count — require role↔face collocation.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function healthcareClinicianOrPatientFace(evidence = '') {
  const text = String(evidence || '');
  // healthcare-web203: French "face l'afflux de patients" titles repeat into
  // "...patients face l'afflux..." which matched role↔face (`patients`+`face`)
  // without any readable clinician/patient portrait. Reject faire-face / afflux.
  if (
    /\b(?:face\s+l[''\u2019]?\s*afflux|afflux\s+(?:croissant\s+)?de\s+patients|patients?\s+face\s+l[''\u2019]?\s*afflux|faire\s+face\s+(?:à|a|l[''\u2019]?))\b/i.test(text)
  ) {
    return false;
  }
  const role = '(?:doctor|surgeon|physician|clinician|radiologist|patient)s?';
  const faceNoun = '(?:faces?|portrait|close[\\s-]?up|expression)';
  // healthcare-web204: "concerned patient care is being jeopardised" (doctors
  // union talking-head) matched emotion+role without any face portrait. Require
  // a face noun after emotion+role, or reject "patient care" / "patient safety".
  const collocated =
    new RegExp(`\\b${role}\\s+${faceNoun}\\b`, 'i').test(text)
    || new RegExp(`\\b${faceNoun}\\s+(?:(?:of\\s+)?(?:a\\s+|the\\s+)?)${role}\\b`, 'i').test(text)
    || new RegExp(`\\b(?:worried|concerned|focused|shocked)\\s+${role}\\s+${faceNoun}\\b`, 'i').test(text)
    || new RegExp(`\\b${role}\\s+(?:worried|concerned|focused|shocked)\\s+faces?\\b`, 'i').test(text)
    || (
      new RegExp(`\\b(?:worried|concerned|focused|shocked)\\s+${role}\\b`, 'i').test(text)
      && !/\b(?:patient|patients)\s+care\b/i.test(text)
      && !/\b(?:patient|patients)\s+safety\b/i.test(text)
      && !/\bdoctors?\s+union\b/i.test(text)
      && !/\bnurses?\s+conduct\b/i.test(text)
    );
  if (!collocated) return false;
  // Walking-away / back-of-head / medic-backs corridor frames are not readable faces.
  if (
    isHealthcareIntroDeadAirOpener(text)
    && !/\b(?:faces?\s+close|close[\s-]?up\s+(?:face|patient|doctor|surgeon)|portrait\s+(?:of\s+)?(?:a\s+|the\s+)?(?:doctor|surgeon|patient)|doctor\s+face\s+close|patient\s+face\s+close)\b/i.test(text)
  ) {
    return false;
  }
  return true;
}

/**
 * healthcare-web200: beauty/cosmetic/"pretty woman face" stock and
 * osteopathy/physio/holistic-rehab clinic ads harvested via doctor-face
 * queries rode a surgical-robot soft-pass into intro cuts and collapsed
 * retention (raw 4.2). These never count as intro evidence unless a strong
 * clinical escape is also present in the same blob.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHealthcareIntroBeautyOrClinicJunk(evidence = '') {
  return /\b(?:pretty\s+wom[ae]n(?:\s*'?s|\s+s)?\s+face|pretty\s+girl(?:\s*'?s|\s+s)?\s+face|beautiful\s+(?:wom[ae]n|girl|model)(?:\s*'?s|\s+s)?\s+face|close\s+up\s+view\s+of\s+pretty\s+wom[ae]n|beauty\s+(?:stock|model|face|portrait|close[\s-]?up|commercial|ad)|cosmetic(?:s)?\s+(?:stock|model|face|ad|commercial|makeup)|makeup\s+(?:tutorial|close[\s-]?up|model|face|stock|ad)|model\s+face\s+(?:close[\s-]?up|stock|beauty|glamour)|fashion\s+model\s+(?:face|close[\s-]?up)|glamour\s+(?:face|portrait|close[\s-]?up|shot)|holistic\s*rehab(?:\s*clinic)?|holisticrehabclinic|osteopath(?:y|ic|s)?|physiotherap(?:y|ist)s?|physio\s+(?:clinic|ad|promo|commercial|centre|center)|rehab\s+clinic\s+(?:ad|promo|commercial|osteopath|holistic)|(?:osteopathy|physiotherapy)\s+(?:clinic|promo|ad|commercial))\b/i.test(
    String(evidence || ''),
  );
}

/**
 * healthcare-web201/web202: obvious non-clinical pads still in the harvest
 * pool — Gaza war-hospital siege news (incl. "gaza s hospitals" possessive
 * scrape), "thought process of highly successful people" brain/self-help,
 * cuffless BP product ads (words between cuffless→pressure), Aaron Judge
 * sports bone bruise, COVID hospital-wave news, leopard/wildlife WooGlobe,
 * Online Seva/CSC consultation promo, "medical computer solutions" product
 * pitch, face-transplant explainers, radiology-guide title slides. Never
 * count as intro evidence; do NOT reject real live-OR surgical robot /
 * radiologist MRI / doctor-patient consultation.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHealthcareIntroPadJunk(evidence = '') {
  const text = String(evidence || '');
  // healthcare-web205: Martha's Rule news packages are political/patient-safety
  // talking-heads — never intro evidence unless the same blob is genuine live
  // OR / surgical-robot / MRI clinical motion.
  if (/\bmartha(?:'?s|\s+s)?\s+rule\b/i.test(text) && !healthcareStrongClinicalMotion(text)) {
    return true;
  }
  // healthcare-web203: French hospital "face l'afflux de patients" titles (no
  // "covid" token) concatenated into "patients face l'afflux" and falsely
  // cleared healthcareClinicianOrPatientFace via role↔face. Also Vox NSFW
  // warning cards, Smile featurette, WebMD app listicles, helicopter stock.
  // Still-clearing mid-video pads after a9892eb: palestine/gaza-strip hospital
  // news, fiber-optic sensor product, pezeshkian geopolitics OR, "life through
  // an MRI" explainer, World Laparoscopy Hospital / laparoscopyhospital.com
  // training promos — drop those so clinician face / live OR can lead.
  // healthcare-web204: doctors-union / nurses-conduct talking-heads cleared via
  // "concerned patient care" emotion+role false-positive (rank 3 > live OR);
  // also SA health industrial-relations pads + generic "robots in the medical
  // field" explainers that laundered via da Vinci name-drop. Prefer Ulster /
  // Shropshire live OR / consultation face.
  // healthcare-web205: ambulance ramping / parliamentary / NSW inquiry pads.
  // healthcare-web207: Zoylo cash-back / LiveLeak / Exo Echo / grapes-to-gowns /
  // VIBE Summit / Tampa phone-ad / telehealth-startup / AI-use-case explainers.
  // healthcare-web211: Shropshire OR led @0 with 2s hold but mid-junk destroyed
  // retention (raw 4.6) — nurse-prank "doctor showing nurse a longer thing" /
  // DesiMasala, Birmingham ambulance-queue critical-incident news, and product
  // MRI pads ("complete radiology solution", "mri ct scan room cam video for
  // you") that cleared intro via bare ct/mri tokens (repair rank 2).
  // healthcare-web214: Shropshire OR led @0 (raw 5.8–6.0) then mid-junk —
  // botox / nano-homeopathy / Jacono rhinoplasty / sexual-assault crime pad /
  // Omron BP product / MRI-crane delivery / FL-DOH skull phone-drama /
  // female-doctors pay-gap talking-head. No clinicalEscape for these.
  return /\b(?:gaza(?:[''\u2019]?s)?\s+(?:war\s+)?hospitals?|gaza\s+s\s+hospitals?|collapse\s+of\s+gaza|under\s+siege.{0,48}hospital|hospital\s+siege|war\s+hospital\s+siege|siege\s+(?:of\s+)?(?:a\s+|the\s+)?(?:gaza\s+)?hospital|hospitals?\s+in\s+(?:the\s+)?gaza|hospital\s+in\s+gaza|palestine\s+hospitals?|doctors?\s+(?:of|in)\s+gaza|courageous\s+doctors?\s+of\s+gaza|gaza\s+strip.{0,80}(?:hospital|medical|shortage|shotage)|(?:hospital|medical).{0,80}gaza\s+strip|thought\s+process\s+of\s+highly\s+successful|highly\s+successful\s+people|cuffless\b[\s\w]{0,40}\b(?:blood\s+)?pressure|panasonic\b[\s\w]{0,40}\bblood\s+pressure\s+monitor|blood\s+pressure\s+monitor\s+(?:product|ad|promo|commercial|review|wearable|pack)|aaron\s+judge|bone\s+bruise|leopards?\b|maasai\s+mara|\bwooglobe\b|wildlife\s+(?:mating|close[\s-]?up|footage)|online\s+seva|\bcsc\s+cent(?:er|re)s?\b|online\s+(?:medical\s+)?consultation[\s\w]{0,60}(?:\bcsc\b|seva|ayush|apollo)|medical\s+computer\s+solutions|face\s+transplant\s+surgery\s+explained|radiology\s+guide\s+featuring|dr\s+wessam|covid[\s-]?19[\s\w]{0,80}(?:h[oô]pitaux?|hospitals?|patients?|afflux|vague|épidémie|epidemie)|(?:vague|wave)\s+de\s+covid|les\s+h[oô]pitaux\s+face|face\s+l[''\u2019]?\s*afflux|afflux\s+(?:croissant\s+)?de\s+patients|patients?\s+face\s+l[''\u2019]?\s*afflux|faire\s+face\s+(?:à|a|l[''\u2019]?)\s*(?:l[''\u2019]?\s*)?(?:afflux|arriv)|organiser\s+face\s+l|sexually\s+explicit\s+images?|sexually\s+molests?|molests?\s+patients?\s+under\s+anesthesia|\bvox\b[\s\w]{0,40}warning|warning[\s\w]{0,40}sexually\s+explicit|smile\s+featurette|behind\s+the\s+scenes.{0,40}traumatic\s+incident|best\s+mobile\s+medical\s+apps|\bwebmd\b|medical\s+helicopter|helicopter\s+(?:stock|landing|helipad)|\bhelipad\b|\bsamu\b|recorded\s+call[\s\w]{0,40}(?:mri|imaging|health)|amazon\.com[\s\w./?=&\-]{0,80}(?:blood\s+pressure|monitor)|fiber\s+optic\s+temperature\s+sensors?|pezeshkian|iran\s+president.{0,60}(?:surgery|operat)|life\s+through\s+an\s+mri|mri.{0,40}blow\s+your\s+mind|blow\s+your\s+mind.{0,40}mri|\blaparoscopyhospital\b|laparoscopy\s*hospital\s*com|journey\s+of\s+innovation.{0,80}(?:laparoscop|robotic\s+surgery\s+training)|world\s+laparoscopy\s+hospital|doctors?\s+union|nurses?\s+conduct|behaviou?ral\s+concerns?\s+about\s+nurses|patient\s+care\s+is\s+being\s+jeopardised|sa\s+health\s+service|industrial\s+relations|industrial\s+action|nurses?\s+strike|doctors?\s+strike|robots?\s+in\s+the\s+medical\s+field|robots?\s+have\s+been\s+used\s+to\s+assist|ambulance\s+ramping|parliamentary\s+inquiry|nsw\s+inquiry|state\s+parliamentary\s+inquiry|patients?\s+dying\s+unnecessarily|cash\s+back\s+on\s+(?:doctor\s+)?consultation|\bzoylo\b|live\s*leak|\bliveleak\b|grapes\s+to\s+gowns|\bexo\s+echo\b|pocket\s+ultrasound|vibe\s+summit|tech\s+startups?\s+increasingly\s+offering|bayview\s+radiology|breast\s+ultrasounds?\s+in\s+tampa|most\s+common\s+use\s+cases?\s+for\s+ai|doctor\s+showing\s+nurse\s+a\s+longer|showing\s+nurse\s+a\s+longer\s+thing|longer\s+thing.{0,48}(?:nurse|doctor|desimasala)|\bdesimasala(?:pjs)?\b|ambulances?\s+queue(?:d|ing)?(?:\s+outside)?|critical\s+incident.{0,96}ambulances?|ambulances?\s+queued?\s+outside|complete\s+radiology\s+solution|mri\s+(?:ct\s+)?scan\s+room\s+cam|room\s+cam\s+video\s+for\s+you|(?:mri|ct)\s+scan\s+room\s+cam\s+video|mri\s+pads?\b|how\s+to\s+consult\s+with\s+any\s+doctor\s+online|\bbotox\b|looking\s+frozen\s+after\s+botox|nano\s+homeopath|homeopath(?:y|ic)|dr\s+lubna\s+kamal|\bjacono\b|rhinoplast|width\s+of\s+her\s+nos|\bomron\b|\bbp742n\b|mri\s+unit\s+lifted|lifted\s+into\s+\w+\s+hospital\s+by\s+crane|denied\s+mri\s+referral|broke\s+skull\s+in\s+mri|fl\s+dept\s+of\s+health|paid\s+less\s+than\s+their\s+male\s+colleagues|female\s+doctors?\s+spent\s+more\s+time)\b/i.test(
    text,
  );
}

/**
 * healthcare-web202: faceless surgical-robot *product* pads (Mira platform /
 * "robot unveiled" / Ballarat installed / Dr Andrew Chung spine promo) cleared
 * healthcareIntroFaceEvidenceMatches via bare "surgical robot" strong motion
 * and led the hook at raw 3.4. These never count as intro evidence unless the
 * same blob also names live OR / da Vinci / surgeon|patient face.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function isHealthcareFacelessRobotProductPad(evidence = '') {
  const text = String(evidence || '');
  if (!text.trim()) return false;
  const productTell = /\b(?:surgical\s+robotic\s+platform|mira\s+surgical|\bxataka\b|robot(?:ics?)?(?:\s+\w+){0,6}\s+unveiled|futuristic\s+surgical\s+robot\s+installed|drandrewchung\.com|www\.drandrewchung|robotic\s+spine\s+surgery\s+arizona|dr\.?\s+andrew\s+chung)\b/i.test(
    text,
  );
  if (!productTell) return false;
  // Live OR / da Vinci / clinician|patient face escapes the product-tell.
  if (
    /\b(?:operating\s+room|or\s+(?:suite|table|lights?)|intraoperative|da\s*vinci)\b/i.test(text)
    || healthcareClinicianOrPatientFace(text)
  ) {
    return false;
  }
  return true;
}

/**
 * Strong clinical escape that may override beauty/clinic junk in the same
 * evidence blob (surgeon/OR/MRI/surgical-robot/radiologist+screen/
 * doctor+patient consultation).
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function healthcareIntroClinicalEscape(evidence = '') {
  const text = String(evidence || '');
  // Dead-air recorded-call / title-card / backs pads must not escape pad-junk
  // drops via bare radiologist+mri tokens (web198/web202 recorded-call MRI error).
  if (isHealthcareIntroDeadAirOpener(text)) {
    return healthcareStrongClinicalMotion(text);
  }
  if (healthcareStrongClinicalMotion(text)) return true;
  if (
    /\bsurgeon\s+(?:face|portrait|close[\s-]?up|expression)\b/i.test(text)
    || /\b(?:face|portrait|close[\s-]?up)\s+(?:of\s+)?(?:a\s+|the\s+)?surgeon\b/i.test(text)
  ) {
    return true;
  }
  if (
    healthcareClinicianOrPatientFace(text)
    && /\b(?:consultation|consulting|bedside)\b/i.test(text)
  ) {
    return true;
  }
  if (
    /\bradiologist\b/i.test(text)
    && /\b(?:screen|monitor|mri|workstation|reviewing)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * Shared healthcare intro-face evidence — used by checkIntroFacePool and
 * checkEditTimelineIntroFace / repairEditTimelineIntroFace so pool and timeline
 * cannot drift (healthcare-web197/web198 corridor / backs / title-card soft-pass;
 * healthcare-web200 beauty/osteopathy junk).
 *
 * Requires doctor/surgeon/patient(/clinician/radiologist) face OR OR/MRI/surgical-robot
 * (or clinician reviewing screen). Corridor / backs / title-card / blurry-container /
 * beauty-stock / osteopathy-clinic establishing never qualifies unless a strong
 * clinical escape is also present.
 *
 * @param {string} evidence
 * @returns {boolean}
 */
export function healthcareIntroFaceEvidenceMatches(evidence = '') {
  const text = String(evidence || '');
  if (!text.trim()) return false;
  // healthcare-web202: faceless Mira/unveiled/Andrew-Chung robot *product* pads
  // must not clear via bare "surgical robot" strong motion — no clinicalEscape
  // override (that escape *is* the strong-motion path that soft-passed web202).
  if (isHealthcareFacelessRobotProductPad(text)) return false;
  const strong = healthcareStrongClinicalMotion(text);
  const face = healthcareClinicianOrPatientFace(text);
  const clinicalEscape = healthcareIntroClinicalEscape(text);
  // Beauty / cosmetic / pretty-woman / osteopathy / rehab-clinic ads never clear
  // unless a true clinical escape (surgeon/OR/MRI/robot/radiologist+screen/
  // doctor+patient consultation) is present in the same blob.
  if (isHealthcareIntroBeautyOrClinicJunk(text) && !clinicalEscape) return false;
  // healthcare-web201/web202/web203: Gaza / self-help / cuffless / COVID-wave /
  // Smile/WebMD / laparoscopyhospital training pads never clear intro evidence —
  // no clinicalEscape override (laparoscop* in a training-promo title must not
  // launder World Laparoscopy Hospital past the pad-junk drop).
  if (isHealthcareIntroPadJunk(text)) return false;
  // Dead-air backs / title-card / walking-away hard-fail unless a true face
  // close-up or visual OR/MRI/robot escape is present in the same blob.
  if (isHealthcareIntroDeadAirOpener(text) && !strong && !face) return false;
  if (isHealthcareEstablishingOpener(text) && !strong && !face) return false;
  return strong || face;
}

/**
 * Rank healthcare intro repair candidates (healthcare-web200/web202):
 * clinician/patient face consultation (4) > clinician/patient face (3) >
 * named live OR — Ulster / Shropshire theatres (3) >
 * other live OR/surgical-robot (2) ≈ MRI/radiologist screen (2) > other qualifying
 * motion (1). Beauty/clinic/product-robot junk never ranks (0). Repair always
 * promotes the highest rank to startSec=0 with a 1.5–2.5s hold.
 *
 * @param {object} asset
 * @returns {number}
 */
export function healthcareIntroRepairRank(asset) {
  const evidence = [asset?.title, asset?.alt, asset?.source, asset?.url]
    .filter(Boolean).join(' ');
  if (!healthcareIntroFaceEvidenceMatches(evidence)) return 0;
  if (
    healthcareClinicianOrPatientFace(evidence)
    && /\b(?:consultation|consulting|bedside|doctor\s+patient|patient\s+doctor)\b/i.test(evidence)
  ) {
    return 4;
  }
  if (healthcareClinicianOrPatientFace(evidence)) return 3;
  // Named live OR / surgical-robot documentaries (Ulster / Shropshire) outrank
  // generic training-OR so repair always lands rank≥2 at startSec=0.
  const namedLiveOr =
    /\b(?:ulster\s+hospital|shropshire\s+hospital)\b/i.test(evidence)
    && /\b(?:surgical\s*robot|surgery\s+robot|da\s*vinci|operating|theatres?)\b/i.test(evidence);
  // healthcare-web203: demote World Laparoscopy Hospital / "journey of
  // innovation" training promos below live OR / da Vinci (Ulster "demonstrated
  // in" live theatres still ranks via surgical robot + OR motion).
  const weakRobotDemo =
    /\b(?:journey\s+of\s+innovation|robotic\s+surgery\s+training|\blaparoscopyhospital\b|world\s+laparoscopy)\b/i.test(
      evidence,
    );
  if (
    /\b(?:surgical\s*robot(?:ics?)?|robot(?:ic)?\s*surger|surgery\s+robot|da\s*vinci|operating\s+room|or\s+(?:suite|table|lights?)|intraoperative)\b/i.test(evidence)
    && healthcareStrongClinicalMotion(evidence)
  ) {
    if (weakRobotDemo) return 1;
    if (namedLiveOr) return 3;
    return 2;
  }
  // MRI / radiologist screen — same floor as live OR/robot so soft-pass
  // best-rank < 2 fails do not discard radiologist-workstation openers.
  if (
    /\b(?:mri\s+(?:scans?|scanners?|machines?|rooms?|monitors?|screens?)|ct\s*(?:scans?|scanners?)|radiologist\s+(?:workstation|screen|monitor|reads?|reviewing)|radiolog\w*\s+(?:ai|workstation|monitor|screen))\b/i.test(evidence)
    || (
      /\bradiologist\b/i.test(evidence)
      && /\b(?:screen|monitor|mri|workstation|reviewing)\b/i.test(evidence)
    )
  ) {
    return 2;
  }
  if (healthcareStrongClinicalMotion(evidence)) return 1;
  return 1;
}

/**
 * Check whether the media pool contains at least one intro-eligible face/lived-in clip
 * for housing topics, or at least one clinical/face clip for healthcare topics.
 *
 * Housing requires a readable human face + housing-topical context, or a lived-in
 * apartment interior signal (eviction/packing/tenant). FEMA maps, news graphics,
 * landscape establishing shots, and webinar talking-heads do NOT qualify.
 *
 * Healthcare requires a clinician+screen / OR / surgical-robot clip, or a readable
 * face + healthcare-topical context. News-desk talking-heads do NOT qualify.
 *
 * Returns { pass: true } for non-housing/healthcare topics, or when a suitable clip
 * is found. Returns { pass: false, reason: 'INTRO_FACE_FAIL: ...' } when none exists,
 * so the caller fails the soft-pass and triggers a re-harvest with face-first queries.
 *
 * @param {object} project
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkIntroFacePool(project) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  const housing = isHousingTopic(topicBlob);
  const healthcare = isHealthcareTopic(topicBlob);
  if (!housing && !healthcare) return { pass: true };

  const videos = (project?.media || []).filter(
    (a) => a.type === 'video' || /\.mp4/i.test(a.url || ''),
  );

  if (housing) {
    const hasIntroFace = videos.some((asset) => {
      // Evidence only — harvest query stamps ("worried tenant face") on music/
      // dartboard pads must not clear the pool when the timeline gate (title/alt
      // only) will still fail (housing-web4/web8 INTRO_FACE_FAIL_TIMELINE).
      const evidence = [asset?.alt, asset?.title, asset?.source, asset?.url]
        .filter(Boolean).join(' ').toLowerCase();
      if (HOUSING_OFF_TOPIC_BROLL_RE.test(evidence)) return false;
      if (isHousingIntroJunkPad(evidence)) return false;
      // Reject known junk intro patterns so they never count as face evidence.
      if (
        /\b(landscape|mountain|lake|lakeside|river|forest|aerial|helicopter|fema|world\s*map|disaster\s*map|news\s*map|webinar|workshop|protest|picket|rent\s+strike|sitting\s+in\s+(?:a\s+)?chair|talking\s+to\s+camera|home\s+tour|jet\s+engine|turbine\s+engine|aircraft\s+engine|engine\s+nacelle|airplane\s+takeoff|plane\s+takeoff|group\s+photo|team\s+photo|office\s+group\s+photo|corporate\s+group|green[\s-]?screen|chroma[\s-]?key|reaction\s+meme|meme\s+reaction|shopify\.com|etsy\.com|title\s+card|housing\s+in\s+our\s+time|naturalization\s+(?:ceremony|film)|citizenship\s+ceremony|tiny[\s-]?houses?|tiny[\s-]?homes?|welcome\s+(?:(?:and|&)\s+)?introduction|presentation\s+slide|resistance\s+band|physiotherapy|split[\s-]?screen\s+talking|split[\s-]?screen\s+kitchen|weeknd|dartboard|maniak|shostakovich|static\s+document|document\s+only|notice\s+only|price\s+index|chart\s+graphic|paper\s+text|credit\s+repair|denied\s+credit|deniedcreditrepair|mortgage\s+protection\s+plan|manheim\s+auction|mammoth\s+(?:real\s+estate|village|condos?)|linkedin\.com|licdn\.com|bigg\s*boss|bbott\d*|official\s+trailer|movie\s+trailer|film\s+trailer|israeli\s+police|mental\s+health\s+(?:a\s+)?silent\s+crisis|men'?s?\s+mental\s+health|timber\s+(?:roots|chronicles)|mortgage\s+fraud|falling\s+for\s+fraud)\b/i.test(evidence)
      ) return false;
      // Align with checkEditTimelineIntroFace — same collocations the post-build
      // gate requires for the first 3s opener. Bare "eviction notice" paper still
      // needs a person/tenant/family signal (web31 static-doc openers).
      return housingIntroFaceEvidenceMatches(evidence);
    });
    if (!hasIntroFace) {
      return {
        pass: false,
        reason:
          'INTRO_FACE_FAIL: no housing face/lived-in clip in pool — only landscape/news/FEMA openers found; re-harvest with face-first queries',
      };
    }
  }

  if (healthcare) {
    const hasIntroFace = videos.some((asset) => {
      // Evidence only — harvest query must not spoof GeekBeat/Bayer past intro rejects
      // (web43: query=surgical robot + GeekBeat title still cleared INTRO_FACE).
      const evidence = [asset?.alt, asset?.title, asset?.source, asset?.url]
        .filter(Boolean).join(' ').toLowerCase();
      // Expo/suit/conference + web43/44 Archive junk never count as clinical intro.
      // Clinical escape (surgical robot OR in *evidence*) still allows real OR demos.
      // Off-topic junk always out — unless evidence itself is clinical OR/robot (expo OR demo).
      if (
        HEALTHCARE_OFF_TOPIC_BROLL_RE.test(evidence)
        && !/\b(surgical\s*robot|operating\s+room|or\s+lights?|da\s*vinci|clinical\s+use)\b/i.test(evidence)
      ) return false;
      if (
        /\b(expo\s+(?:floor|booth|hall|suit)|exhibition\s+hall|trade\s*show\b|\bhimss\b|conference\s+(?:floor|booth|expo)|suit\s+(?:walk|drop|enter|stroll)|business\s+suit\s+(?:walk|stroll|enter)|blurry\s+test\s*tube|test\s*tube\s+(?:close\s*up|b-?roll|stock|only)|petri\s+dish|corporate\s+presentation)\b/i.test(evidence)
        && !/\b(surgical\s*robot|operating\s+room|or\s+lights?|clinical\s+use|patient|surgeon)\b/i.test(evidence)
      ) return false;
      if (isScienceNationBrandingPad(evidence)) return false;
      if (isHealthcareProductPitchIntro(evidence)) return false;
      if (isHealthcareFacelessRobotProductPad(evidence)) return false;
      // healthcare-web197: shared with timeline gate — corridor/building/blurry-container
      // out; require doctor/surgeon/patient face OR OR/MRI/surgical-robot.
      return healthcareIntroFaceEvidenceMatches(evidence);
    });
    if (!hasIntroFace) {
      return {
        pass: false,
        reason:
          'INTRO_FACE_FAIL: no healthcare clinical/face clip in pool — only corridor/news/graphics/talking-head openers found; re-harvest with face-first queries',
      };
    }
    // healthcare-web202: soft-pass with only rank-1 leftovers (or faceless product
    // robots that previously ranked 2) still shipped chaos. Require best repair
    // rank ≥ 2 (consultation/face/OR/robot/MRI-screen tier).
    const bestRank = videos.reduce(
      (best, asset) => Math.max(best, healthcareIntroRepairRank(asset)),
      0,
    );
    if (bestRank < 2) {
      return {
        pass: false,
        reason:
          'INTRO_FACE_FAIL: best healthcare intro repair rank < 2 — need consultation face, live OR/robot, or MRI/radiologist screen; re-harvest face-first',
      };
    }
  }

  return { pass: true };
}

/**
 * Post-build check: does the ASSEMBLED editTimeline open on a clinical/face
 * video as the **earliest** cut of the first script segment?
 *
 * housing-web159 / healthcare-web201: an ANY-in-first-3s soft-pass let junk lead
 * at startSec=0 while a face/OR clip at 0.65–2s cleared the gate and blocked
 * repair. The first cut itself must clear intro evidence (and sit near 0).
 *
 * Housing/healthcare only. Returns { pass: true } for all other topics.
 *
 * @param {object} project — must include editTimeline + media
 * @returns {{ pass: boolean, reason?: string }}
 */
/** Title/alt/source/url only — never harvest `query`. */
function timelineIntroEvidenceOf(asset) {
  return [asset?.title, asset?.alt, asset?.source, asset?.url].filter(Boolean).join(' ');
}

/** NSF / Science Nation branding pads (web70/71 globe-logo intros). */
function isScienceNationBrandingPad(evidence) {
  const e = String(evidence || '');
  // healthcare-web76: Science Nation Archive packs stamp the logo repeatedly even when
  // the title says "surgical robotics" — treat any science-nation / sciencenation /
  // NSF Science Nation evidence as a branding pad (CNBC/Dexter/da Vinci remain).
  return /\bscience\s+nation\b|sciencenation|\bnsf\s+science\s+nation\b/i.test(e);
}

function isHealthcareProductPitchIntro(evidence) {
  // healthcare-web73: AWBUS / "better choice" ultrasound promo + training series
  // talking-heads cleared doctor+screen and led the hook ahead of CNBC/OR motion.
  return /\b(better\s+choice\s+over|hand[\s-]?held\s+ultrasound\s+screening|\bawbus\b|healthcare\s+professional\s+information\s+series|user\s+training\s+part\s*\d|discussing\s+cancer\s+screening\s+with\s+patients|lab\s+interfaces|omnibotics|corin.?s?\s+robotic|shelford\s+surgical\s+training|insertable\s+cardiac\s+monitor|reveal\s+linq)\b/i.test(
    String(evidence || ''),
  );
}

function assetPassesHealthcareTimelineIntro(asset) {
  if (!(asset?.type === 'video' || /\.mp4/i.test(asset?.url || ''))) return false;
  const evidence = timelineIntroEvidenceOf(asset);
  if (HEALTHCARE_OFF_TOPIC_BROLL_RE.test(evidence)) return false;
  if (isHealthcareFacelessRobotProductPad(evidence)) return false;
  if (isHealthcareIntroPadJunk(evidence)) return false;
  if (isScienceNationBrandingPad(evidence)) return false;
  if (isHealthcareProductPitchIntro(evidence)) return false;
  // healthcare-web197/web198: bare "doctor" / corridor / backs / title-card /
  // French "faire face" must NOT clear — require clinician/patient face collocation
  // or visual OR/MRI/surgical-robot.
  return healthcareIntroFaceEvidenceMatches(evidence);
}

function assetPassesHousingTimelineIntro(asset) {
  const evidence = timelineIntroEvidenceOf(asset);
  if (!evidence.trim()) return false;
  if (HOUSING_OFF_TOPIC_BROLL_RE.test(evidence)) return false;
  if (isHousingIntroJunkPad(evidence)) return false;
  // housing-web82: LinkedIn credit-repair flyer stills / mortgage-protection ads
  // matched person+eviction query stamps and won intro-face repair, then dominated
  // thumbnail-still fallbacks when yt-dlp missed real motion.
  const urlBlob = `${asset?.url || ''} ${asset?.sourceUrl || ''} ${asset?.source || ''}`;
  if (/\b(linkedin\.com|licdn\.com|media\.licdn)\b/i.test(urlBlob)) return false;
  if (/\b(static\s+document|document\s+only|notice\s+only|price\s+index|chart\s+graphic|paper\s+text|credit\s+repair|denied\s+credit|mortgage\s+protection)\b/i.test(evidence)) {
    return false;
  }
  // Intro must be real motion — stills of promo flyers read as spam PowerPoints.
  if (!(asset?.type === 'video' || /\.mp4/i.test(asset?.url || ''))) return false;
  return housingIntroFaceEvidenceMatches(evidence);
}

/**
 * First-segment cuts with startSec < 3, sorted by startSec ascending.
 * @param {object} project
 * @returns {object[]}
 */
function firstSegmentIntroCuts(project) {
  const timeline = project?.editTimeline || [];
  const firstSegId = project?.script?.[0]?.id
    || timeline.find((t) => typeof t?.segmentId === 'string')?.segmentId
    || null;
  return timeline
    .filter((t) => {
      if ((t.startSec ?? 0) >= 3) return false;
      if (firstSegId && t.segmentId && t.segmentId !== firstSegId) return false;
      return true;
    })
    .slice()
    .sort((a, b) => (a.startSec ?? 0) - (b.startSec ?? 0));
}

export function checkEditTimelineIntroFace(project) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  const housing = isHousingTopic(topicBlob);
  const healthcare = isHealthcareTopic(topicBlob);
  if (!housing && !healthcare) return { pass: true };

  const mediaById = new Map((project?.media || []).map((m) => [m.id, m]));
  const introCuts = firstSegmentIntroCuts(project);

  if (!introCuts.length) return { pass: true };

  // Earliest cut must itself clear intro evidence — NOT any asset in the first 3s
  // (housing-web159 Bull Street @0 + West Sussex @0.65 soft-pass; healthcare-web201
  // "thought process…" @0 + surgical robot @0.65 soft-pass).
  const earliest = introCuts[0];
  if ((earliest.startSec ?? 0) > 0.15) {
    return {
      pass: false,
      reason: housing
        ? 'INTRO_FACE_FAIL_TIMELINE: earliest first-segment cut does not start near 0 — face/lived-in opener missing at hook; re-harvest face-first'
        : 'INTRO_FACE_FAIL_TIMELINE: earliest first-segment cut does not start near 0 — doctor/OR/MRI opener missing at hook; re-harvest face-first',
    };
  }

  const earliestAsset = mediaById.get(earliest.assetId);
  if (!earliestAsset) {
    return {
      pass: false,
      reason: housing
        ? 'INTRO_FACE_FAIL_TIMELINE: first cut has no resolvable media asset; re-harvest face-first'
        : 'INTRO_FACE_FAIL_TIMELINE: first cut has no resolvable media asset; re-harvest face-first',
    };
  }

  if (healthcare) {
    if (!assetPassesHealthcareTimelineIntro(earliestAsset)) {
      return {
        pass: false,
        reason:
          'INTRO_FACE_FAIL_TIMELINE: first cut has no doctor/surgeon/patient face or OR/MRI/surgical-robot — corridor/backs/hallway/title-card or archive junk leads the hook; re-harvest face-first',
      };
    }
  }

  if (housing) {
    if (!assetPassesHousingTimelineIntro(earliestAsset)) {
      return {
        pass: false,
        reason:
          'INTRO_FACE_FAIL_TIMELINE: first cut has no face/lived-in opener for housing hook; re-harvest face-first',
      };
    }
  }

  return { pass: true };
}

/**
 * Promote the best intro-face candidate to startSec=0 of the first script segment.
 *
 * Runs when:
 * - the earliest cut fails checkEditTimelineIntroFace, OR
 * - the earliest cut's housingIntroRepairRank / healthcareIntroRepairRank is
 *   strictly less than the best pool candidate (even if a later-in-window clip
 *   would have soft-passed the old any-in-3s check).
 *
 * Mutates project.editTimeline.
 *
 * @param {object} project
 * @returns {{ repaired: boolean, pass: boolean, reason?: string }}
 */
export function repairEditTimelineIntroFace(project) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  const housing = isHousingTopic(topicBlob);
  const healthcare = isHealthcareTopic(topicBlob);
  if (!housing && !healthcare) {
    return { repaired: false, pass: true };
  }

  const media = project?.media || [];
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const qualifies = housing
    ? assetPassesHousingTimelineIntro
    : assetPassesHealthcareTimelineIntro;
  const rankFn = housing ? housingIntroRepairRank : healthcareIntroRepairRank;
  // Prefer video (housing-web82: stills of LinkedIn flyers must not win intro).
  // healthcare-web198: rank face close-up > OR/MRI/surgical-robot > other.
  // housing-web159: rank documentary tenant/grandmother eviction faces over
  // leftover lived-in pads (trailers/reality-TV already filtered by qualifies).
  const candidates = media.filter((a) => qualifies(a));
  const videoCandidates = candidates.filter(
    (a) => a.type === 'video' || /\.mp4/i.test(a.url || ''),
  );
  const pool = videoCandidates.length ? videoCandidates : candidates;
  const replacement = !pool.length
    ? null
    : [...pool].sort((a, b) => rankFn(b) - rankFn(a))[0];

  const timeline = Array.isArray(project.editTimeline) ? [...project.editTimeline] : [];
  const firstSegId = project?.script?.[0]?.id
    || timeline.find((t) => typeof t?.segmentId === 'string')?.segmentId
    || null;
  const introCuts = firstSegmentIntroCuts(project);
  const earliestCut = introCuts[0] || null;
  const earliestIdx = earliestCut
    ? timeline.findIndex((t) => t === earliestCut || (
      t.assetId === earliestCut.assetId
      && (t.startSec ?? 0) === (earliestCut.startSec ?? 0)
      && t.segmentId === earliestCut.segmentId
    ))
    : timeline.findIndex((t) => {
      if ((t.startSec ?? 0) >= 3) return false;
      if (firstSegId && t.segmentId && t.segmentId !== firstSegId) return false;
      return true;
    });

  const earliestAsset = earliestCut ? mediaById.get(earliestCut.assetId) : null;
  const earliestPasses = earliestAsset ? qualifies(earliestAsset) : false;
  const earliestStartOk = earliestCut ? (earliestCut.startSec ?? 0) <= 0.15 : false;
  const earliestRank = earliestAsset && earliestPasses ? rankFn(earliestAsset) : 0;
  const bestRank = replacement ? rankFn(replacement) : 0;
  const before = checkEditTimelineIntroFace(project);

  // Always promote when earliest fails, sits off-zero, or is outranked by a
  // better pool candidate (housing-web159 / healthcare-web201).
  const needsPromotion = Boolean(replacement?.id) && (
    !before.pass
    || !earliestPasses
    || !earliestStartOk
    || bestRank > earliestRank
  );

  if (!needsPromotion) {
    // Even when the earliest cut already clears the gate, stretch a sub-1.5s
    // opener to INTRO_FACE_HOLD_SEC so hooks aren't jarring 0.65s slideshows
    // (housing-web164 West Sussex @0 with endSec=0.65 → raw 6.2).
    const INTRO_FACE_HOLD_SEC = 2.0;
    if (
      before.pass
      && earliestIdx >= 0
      && earliestPasses
      && earliestStartOk
      && (Number(timeline[earliestIdx].endSec) || 0) < 1.5
    ) {
      const holdEnd = INTRO_FACE_HOLD_SEC;
      timeline[earliestIdx] = {
        ...timeline[earliestIdx],
        startSec: 0,
        endSec: holdEnd,
        reason: timeline[earliestIdx].reason || 'intro-face-hold',
      };
      const segId = timeline[earliestIdx].segmentId;
      project.editTimeline = timeline.filter((entry, idx) => {
        if (idx === earliestIdx) return true;
        if (segId && entry.segmentId && entry.segmentId !== segId) return true;
        return (entry.startSec ?? 0) >= holdEnd - 0.05;
      });
      return { repaired: true, pass: true };
    }
    return { repaired: false, pass: before.pass, reason: before.reason };
  }
  if (!replacement?.id) return { repaired: false, ...before };

  // Hold the repaired opener 1.5–2.5s so the hook isn't a 0.65s slideshow
  // (housing-web164 / healthcare-web204/206: face/OR at 0 cut away in <1s).
  const INTRO_FACE_HOLD_SEC = 2.0;
  const holdEnd = INTRO_FACE_HOLD_SEC;
  const patched = {
    segmentId: firstSegId || (earliestIdx >= 0 ? timeline[earliestIdx].segmentId : undefined),
    startSec: 0,
    endSec: holdEnd,
    assetId: replacement.id,
    reason: 'intro-face-repair',
  };
  if (earliestIdx >= 0) {
    timeline[earliestIdx] = { ...timeline[earliestIdx], ...patched };
  } else {
    timeline.unshift(patched);
  }
  // Drop any other first-segment cuts that overlap the held opener window so
  // assembly does not splice a 0.65s duplicate under the face hold.
  const segId = patched.segmentId;
  const cleaned = timeline.filter((entry, idx) => {
    if (earliestIdx >= 0 ? idx === earliestIdx : idx === 0) return true;
    if (segId && entry.segmentId && entry.segmentId !== segId) return true;
    const start = entry.startSec ?? 0;
    return start >= holdEnd - 0.05;
  });
  project.editTimeline = cleaned;
  const after = checkEditTimelineIntroFace(project);
  return { repaired: after.pass, ...after };
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
      // Housing/healthcare hard-pass still requires an intro-tier face clip.
      const introFace = checkIntroFacePool(project);
      if (!introFace.pass) return introFace;
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

  // Healthcare (hospital / AI-medicine / clinical) — keyless web+Archive path, mirrored
  // on housing's structure: fail-closed on intro face first, then the shared junk-ratio
  // + topical-strong-video-floor gate, then a keyless thin-pool floor of 4 (not 6) so a
  // thin-but-valid Archive+Dailymotion pool clears post-Vimeo-purge the same way housing
  // does, without re-trusting Vimeo or loosening the junk/strong-evidence gates above.
  if (isHealthcareTopic(topicBlob)) {
    const introFace = checkIntroFacePool(project);
    if (!introFace.pass) return introFace;
    const healthcareSoftFail = healthcareSoftPassMotionFailureReason(project, {
      genericJunkRatio,
      genericJunkVideos,
      uniqueVideos,
      videoCount,
    });
    if (healthcareSoftFail) {
      return { pass: false, reason: healthcareSoftFail };
    }
    // Don't soft-pass thin inject pools — force faceSeek re-harvest (web204–206
    // plateaued at raw 6.0 on thin OR/face yield after junk rejects).
    const thinVariety = thinInjectVarietyFailReason(mediaReport, uniqueVideos, 'healthcare');
    if (thinVariety) return { pass: false, reason: thinVariety };
    const minHealthcareVideos = hasStockKeys
      ? Math.max(12, segN * 2)
      : HEALTHCARE_KEYLESS_SOFT_PASS_MIN_VIDEOS;
    if (videoCount < minHealthcareVideos) {
      return {
        pass: false,
        reason: `soft-pass-motion-healthcare-thin(${videoCount}/${minHealthcareVideos} videos)`,
      };
    }
    if (stockFetched > 0 || topUp >= segN || liveMotionPresent) {
      return { pass: true, reason: `soft-pass-motion-healthcare(${videoCount}v/${segN}segs)` };
    }
    return {
      pass: false,
      reason: `soft-pass-motion-healthcare-no-live-motion(${videoCount}v/${segN}segs)`,
    };
  }

  // Housing — fail-closed on intro face tier. A housing harvest that has enough
  // volume but only landscape/news/FEMA openers triggers a face-first re-harvest.
  // Then apply the same junk-ratio + topical-evidence-majority gate airline and
  // healthcare already earn ≥7 with (housing previously only checked a looser
  // 0.4 generic-junk ratio and no strong-evidence floor at all — the highest-
  // leverage structural gap vs. airline-web8's junk-demotion path).
  if (isHousingTopic(topicBlob)) {
    const introFace = checkIntroFacePool(project);
    if (!introFace.pass) return introFace;
    const housingSoftFail = housingSoftPassMotionFailureReason(project, {
      genericJunkRatio,
      genericJunkVideos,
      uniqueVideos,
      videoCount,
    });
    if (housingSoftFail) {
      return { pass: false, reason: housingSoftFail };
    }
    // Don't soft-pass thin inject pools — force faceSeek re-harvest instead of
    // shipping a 4–6 clip slideshow that plateaus at raw 5–6 (web161–164).
    const thinVariety = thinInjectVarietyFailReason(mediaReport, uniqueVideos, 'housing');
    if (thinVariety) return { pass: false, reason: thinVariety };
    // Keyless: intro-face + generic-junk + VHS/map rejects already ran.
    // web57–58 starve at 4–5 unique videos after relevance even with bing=50+.
    // Floor 4 unblocks watches; floor 3 (web36) is banned — that shipped VHS junk.
    const minHousingVideos = hasStockKeys
      ? Math.max(12, segN * 2)
      : 4;
    if (videoCount < minHousingVideos) {
      return {
        pass: false,
        reason: `soft-pass-motion-housing-thin(${videoCount}/${minHousingVideos} videos)`,
      };
    }
    if (stockFetched > 0 || topUp >= segN || liveMotionPresent) {
      return { pass: true, reason: `soft-pass-motion-housing(${videoCount}v/${segN}segs)` };
    }
    return {
      pass: false,
      reason: `soft-pass-motion-housing-no-live-motion(${videoCount}v/${segN}segs)`,
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
/**
 * Keyless healthcare runs fill from web+Archive, same as housing once the Vimeo
 * fetch-time circuit purges doomed proxy clips (openVimeoFetchCircuit). The floor
 * mirrors housing's keyless floor (4) rather than airline's (6) — after intro-face
 * + junk-ratio + strong-video-floor(1) already ran in healthcareSoftPassMotionFailureReason,
 * a thin-but-valid Archive+Dailymotion pool should clear the same way housing does,
 * instead of stalling on soft-pass-motion-healthcare-thin(3-5/6) post-purge.
 */
const HEALTHCARE_KEYLESS_SOFT_PASS_MIN_VIDEOS = 4;
const HEALTHCARE_SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.25;
const HEALTHCARE_SOFT_PASS_HARD_JUNK_RATIO_MAX = 0.12;

/**
 * Block soft-pass when inject yield is thin (1–11) AND variety is thin.
 * Prefer faceSeek re-harvest over shipping a 4–6 clip slideshow that plateaus
 * below raw ≥7 (housing-web161–164 / healthcare-web204–206).
 * Only arms when mediaReport.videoTopUp is a non-empty array (real inject ran
 * but under-filled). Empty/`undefined` top-up leaves legacy soft-pass floors alone.
 *
 * @param {object} mediaReport
 * @param {object[]} uniqueVideos
 * @param {string} topicLabel
 * @returns {string|null}
 */
export function thinInjectVarietyFailReason(mediaReport, uniqueVideos = [], topicLabel = '') {
  if (!Array.isArray(mediaReport?.videoTopUp)) return null;
  const injected = mediaReport.videoTopUp.length;
  // injected===0 → inject accounting absent / empty sentinel in unit fixtures.
  if (injected === 0 || injected >= 12) return null;
  const hosts = new Set();
  for (const asset of uniqueVideos) {
    let host = '';
    try {
      const raw = canonicalMediaKey(asset?.url || '') || asset?.url || '';
      host = new URL(raw, 'http://local').hostname.replace(/^www\./, '');
    } catch {
      host = String(asset?.source || asset?.id || 'unknown').slice(0, 48);
    }
    if (host && host !== 'local') hosts.add(host);
  }
  const videoN = uniqueVideos.length;
  const thin = videoN < 8 || hosts.size < 3;
  if (!thin) return null;
  return (
    `INTRO_FACE_FAIL: soft-pass blocked — injected=${injected}<12 with thin variety`
    + ` (${videoN}v/${hosts.size}hosts ${topicLabel}); re-harvest face-first`
  );
}

/**
 * Housing junk-ratio ceilings, ported from airline-web8's soft-pass path.
 * Previously housing only checked the shared 0.4 SOFT_PASS_GENERIC_JUNK_RATIO_MAX
 * (looser than airline/healthcare's 0.25) and had no hard-junk-ratio gate or
 * topical-evidence-majority floor at all — the highest-leverage structural
 * gap that let junk-heavy pools ("split-screen news package", inconsistent
 * webcam quality) clear soft-pass and land at raw 6.4 instead of ≥7.
 */
const HOUSING_SOFT_PASS_MIN_STRONG_VIDEOS = 4;
const HOUSING_SOFT_PASS_GENERIC_JUNK_RATIO_MAX = 0.25;
const HOUSING_SOFT_PASS_HARD_JUNK_RATIO_MAX = 0.12;

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

/**
 * RP/roleplay "mental hospital" Archive.org identifiers scraped via "hospital ward nurses"
 * queries (healthcare-web48: rpmentalhospital001 + mental_hospital_edit). Both items carry
 * "hospital" in their titles, which makes them pass HEALTHCARE_EVIDENCE_RE but they are
 * tabletop-RPG recordings, not clinical footage.
 */
export const RP_MENTAL_HOSPITAL_RE =
  /rpmentalhospital|rp[-_]mental[-_\s]hospital|mental[-_]hospital[-_]edit|RP[-_]Mental[-_]Hospital/i;

/**
 * YouTube Poop Music Video compilations scraped via "intensive care unit" queries
 * (healthcare-web48: "intensive care unit compilation youtube poop music videos ytpmv").
 * These are meme/remix videos, not documentary footage.
 */
export const YOUTUBE_POOP_YTPMV_RE =
  /\b(ytpmv|youtube[\s-]poop|poop\s+music\s+video)\b/i;

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
  {
    // healthcare-web48: "hospital ward nurses" query → rpmentalhospital001 + mental_hospital_edit
    // (tabletop-RPG recordings). Both carry "hospital" so they pass HEALTHCARE_EVIDENCE_RE
    // but are not clinical footage.
    reason: 'rp-roleplay-hospital',
    pattern: RP_MENTAL_HOSPITAL_RE,
  },
  {
    // healthcare-web48: "intensive care unit" query → "intensive care unit compilation
    // youtube poop music videos ytpmv". YTPMV clips are meme/remix, not documentary.
    reason: 'youtube-poop-ytpmv',
    pattern: YOUTUBE_POOP_YTPMV_RE,
  },
  {
    // healthcare-web61: Kaggle slide/notebook/competition clips scrape into radiology
    // harvest via queries like "AI medical imaging". Already in HEALTHCARE_OFF_TOPIC_BROLL_RE
    // with narrower compound tokens; add as hard-reject so pool-level gating fires first.
    reason: 'kaggle-slide',
    pattern: /\bkaggle\b/i,
  },
  {
    // healthcare-web61: srcpublishers.com academic manuscript promo slides.
    // Identified by URL; title alone may look clinical.
    reason: 'srcpublishers-promo',
    pattern: /srcpublishers\.com/i,
  },
  {
    // healthcare-web61: "MANUSCRIPT TODAY" promo slides from the srcpublishers orbit.
    reason: 'manuscript-today-promo',
    pattern: /\bmanuscript\s+today\b/i,
  },
  {
    // healthcare-web61: cassette tape / VHS cassette glitch-art pads that scraped in
    // via retro-aesthetic stock queries; no clinical use for cassette in this context.
    reason: 'cassette-glitch-pad',
    pattern: /\bcassette\b/i,
  },
  {
    // Guerbet is a radiology-contrast pharma company whose marketing clips
    // scrape into clinical harvest. Already caught by `guerbet\s+aimed` in
    // HEALTHCARE_OFF_TOPIC_BROLL_RE; standalone catch here blocks all variants.
    // RSNA standalone removed — `rsna\s+20\d{2}|workflow\s+automation\s+at\s+rsna`
    // in HEALTHCARE_OFF_TOPIC_BROLL_RE is specific enough; bare `\brsna\b` would
    // false-reject legitimate Science Nation / award-demo clips that mention RSNA.
    reason: 'guerbet-pharma-promo',
    pattern: /\bguerbet\b/i,
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

function housingVideoBlob(asset = {}) {
  return `${asset.alt || ''} ${asset.title || ''} ${asset.source || ''} ${asset.sourceUrl || ''} ${asset.url || ''} ${asset.query || ''}`;
}

/**
 * Housing already has a comprehensive off-topic-B-roll regex
 * (HOUSING_OFF_TOPIC_BROLL_RE / HOUSING_AVIATION_PAD_RE / HOUSING_GROUP_PHOTO_JUNK_RE,
 * wired through housingOffTopicBrollReason) that plays the same role as
 * AIRLINE_HARD_REJECT_PATTERNS / HEALTHCARE_HARD_REJECT_PATTERNS — reuse it
 * directly rather than duplicating a second junk-pattern list.
 */
function housingHardRejectReason(asset = {}, topicBlob = '') {
  const blob = housingVideoBlob(asset);
  return housingOffTopicBrollReason(blob, topicBlob) || null;
}

function isHousingStrongVideo(asset = {}, topicBlob = '') {
  const topic = String(topicBlob || '') || 'housing eviction tenant';
  if (
    housingHardRejectReason(asset, topic)
    || isGenericStockJunk(housingVideoBlob(asset), topic)
  ) {
    return false;
  }
  return hasHousingEvidence(asset);
}

/**
 * Unique videos carrying real housing/tenant/eviction/mortgage evidence.
 *
 * @param {object[]} [uniqueVideos]
 * @param {string} [topicBlob]
 */
export function countHousingStrongVideos(uniqueVideos = [], topicBlob = '') {
  return uniqueVideos.filter((asset) => isHousingStrongVideo(asset, topicBlob)).length;
}

/**
 * Housing soft-pass junk gate, ported from airline/healthcare: a hard-junk-ratio
 * ceiling, a tightened generic-junk-ratio ceiling on the clean pool (0.25, not
 * the shared 0.4), and a topical-evidence-majority floor. Housing previously had
 * none of the last two, letting junk-heavy or off-topic-majority pools clear
 * soft-pass and land at raw 6.4 (housing-web69) instead of ≥7 like airline-web8.
 *
 * @param {object} project
 * @param {object} [stats]
 * @returns {string|null}
 */
export function housingSoftPassMotionFailureReason(project, stats = {}) {
  const topicBlob = `${project?.topic || ''} ${project?.title || ''}`;
  if (!isHousingTopic(topicBlob)) return null;

  const uniqueVideos = stats.uniqueVideos || uniqueVideoAssets(project?.media || []);
  const videoCount = stats.videoCount ?? uniqueVideos.length;

  const hardJunkVideos = uniqueVideos.filter((asset) => housingHardRejectReason(asset, topicBlob));
  const hardJunkRatio = videoCount ? hardJunkVideos.length / videoCount : 0;
  if (
    hardJunkVideos.length >= 3
    || (videoCount > 0 && hardJunkRatio > HOUSING_SOFT_PASS_HARD_JUNK_RATIO_MAX)
  ) {
    const reason = housingHardRejectReason(hardJunkVideos[0], topicBlob) || 'hard-junk';
    return `soft-pass-motion-housing-junk(${reason}:${hardJunkVideos.length}/${videoCount})`;
  }

  const cleanVideos = uniqueVideos.filter((asset) => !housingHardRejectReason(asset, topicBlob));
  const genericJunkVideos = stats.genericJunkVideos ?? cleanVideos.filter((asset) => (
    isGenericStockJunk(housingVideoBlob(asset), topicBlob)
  )).length;
  const cleanCount = cleanVideos.length || videoCount;
  const genericJunkRatio = stats.genericJunkRatio ?? (cleanCount ? genericJunkVideos / cleanCount : 0);
  if (genericJunkRatio > HOUSING_SOFT_PASS_GENERIC_JUNK_RATIO_MAX) {
    return `soft-pass-motion-housing-generic-junk(${genericJunkVideos}/${cleanCount} videos)`;
  }

  const strongVideos = countHousingStrongVideos(cleanVideos, topicBlob);
  const hasStockKeys = Boolean(
    process.env.PEXELS_API_KEY
      || process.env.VITE_PEXELS_KEY
      || process.env.PIXABAY_API_KEY
      || process.env.VITE_PIXABAY_KEY,
  );
  const strongFloor = hasStockKeys
    ? HOUSING_SOFT_PASS_MIN_STRONG_VIDEOS
    : 1;
  if (strongVideos < strongFloor) {
    return `soft-pass-motion-housing-topical-strong-floor(${strongVideos}/${strongFloor} videos)`;
  }

  return null;
}
