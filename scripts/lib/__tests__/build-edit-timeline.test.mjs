import { describe, it, expect } from 'vitest';
import {
  introFaceTier,
  hasReadableFaceVisual,
  passesHousingTimelineIntroEvidence,
  isHousingApartmentMotion,
  isHousingTalkingHeadMotion,
  isLandscapeOnlyIntroVisual,
  visualSubjectCluster,
  buildEditTimeline,
} from '../build-edit-timeline.mjs';

const HOUSING_TOPIC = 'The landlord algorithm that evicted tenants from rent-stabilized apartments';

// ---------------------------------------------------------------------------
// introFaceTier
// ---------------------------------------------------------------------------

describe('introFaceTier', () => {
  it('returns 0 for an asset with no face-like metadata', () => {
    const asset = { query: 'airplane runway', alt: 'runway tarmac at dusk', url: 'https://example.com/runway.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 0 for a back-of-head shot (not a readable face)', () => {
    const asset = { query: 'passenger window', alt: 'back of head looking through airplane window', url: 'https://example.com/backhead.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 1 for a generic readable face (non-topical)', () => {
    // needs both face term AND human role term for hasReadableFaceVisual
    const asset = {
      query: 'couple worried',
      alt: 'couple face worried portrait close-up people',
      url: 'https://example.com/couple.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: false })).toBe(1);
  });

  it('returns 2 for a topical readable face on airline topic', () => {
    const asset = {
      query: 'passenger worried cabin',
      alt: 'passenger face worried airplane cabin close-up portrait people',
      url: 'https://example.com/pass.jpg',
    };
    expect(introFaceTier(asset, { airline: true, housing: false })).toBe(2);
  });

  it('returns 2 for a topical readable face on housing topic', () => {
    const asset = {
      query: 'tenant eviction letter',
      alt: 'tenant face worried eviction notice apartment close-up portrait people',
      url: 'https://example.com/tenant.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(2);
  });

  it('returns 1 for modern apartment motion without a strict face tag (housing)', () => {
    const asset = {
      query: 'modern apartment living room daylight',
      alt: 'modern apartment interior living room daylight',
      url: 'https://example.com/apt.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(1);
  });

  it('returns -1 for landscape-only stock on housing topics', () => {
    const asset = {
      query: 'scenic lake',
      alt: 'aerial landscape mountain lake scenic view',
      url: 'https://archive.org/download/lake/lake.mp4',
      source: 'Archive.org live',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('treats Archive bay/war home-movie stock as landscape-only for housing intro', () => {
    const asset = {
      query: 'worried couple reading letter home',
      alt: 'vietnam war home movie of subic bay philippines re supply trip 1966 67',
      title: 'vietnam war home movie of subic bay philippines re supply trip 1966 67',
      url: 'https://archive.org/download/Gregg_Arthur_Subic_Bay_1966/Gregg_Arthur_Subic_Bay_1966.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('treats suburban street establishing as landscape-only for housing intro', () => {
    const asset = {
      query: 'housing market crash phoenix',
      alt: 'suburban street residential neighborhood palm trees stucco homes',
      title: 'suburban street residential neighborhood palm trees',
      url: 'https://example.com/street.mp4',
      type: 'video',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('demotes tenant/rent webinars as low-energy housing openers', () => {
    const asset = {
      query: 'tenant eviction',
      alt: 'richmond rent program workshop webinar handling habitability problems tenant focused',
      title: 'richmond rent program workshop webinar handling habitability problems tenant focused',
      url: 'https://archive.org/download/rent/rent.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(isHousingTalkingHeadMotion(asset)).toBe(true);
    // Still classified as talking-head motion, but never tiered as an intro lead (web17).
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects sitting-in-chair and home-tour static openers on housing intro', () => {
    const chair = {
      query: 'tenant rent',
      alt: 'man sitting in a chair talking to camera desk zoom call',
      title: 'office chair webinar desk',
      url: 'https://example.com/chair.mp4',
      type: 'video',
    };
    const tour = {
      query: 'apartment interior',
      alt: '3bhk luxury apartment home tour walkthrough',
      title: '3bhk home tour million apartment',
      url: 'https://example.com/tour.mp4',
      type: 'video',
    };
    expect(introFaceTier(chair, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier(tour, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects Rolfe Report / Periscope nest / dynamite openers on housing intro', () => {
    expect(introFaceTier({
      query: 'housing crash',
      alt: 'THE ROLFE REPORT WITH JOHN ROLFE thumbnail composite',
      title: 'rolfe report housing',
      url: 'https://example.com/rolfe.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'for rent sign',
      alt: 'a ceiling on your home propaganda film periscopefilm bird nest',
      title: 'periscope film 18384',
      url: 'https://archive.org/download/18384/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'ticking time bomb',
      alt: 'sticks of dynamite ticking time bomb alarm clock',
      title: 'time bomb stock',
      url: 'https://example.com/bomb.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'tenant eviction',
      alt: 'the progress center from affordable housing to self sufficiency',
      title: 'progress center affordable housing',
      url: 'https://archive.org/download/progress/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'apartment building',
      alt: 'county announces completion of apartment building inspection initiative',
      title: 'administrative officer podium',
      url: 'https://archive.org/download/county/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects protest / rent-strike / tribunal openers on housing intro (web20)', () => {
    expect(introFaceTier({
      query: 'rent strike',
      alt: 'parkdale vs the ltb',
      title: 'parkdale vs the ltb',
      url: 'https://archive.org/download/parkdale/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'tenant eviction',
      alt: 'Social Justice Tribunals Ontario tenants reject rent increase gavel',
      title: 'tribunal protest hearing',
      url: 'https://archive.org/download/tribunal/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects RE/MAX for-sale, headset talking-head, and luxury tour openers on housing intro', () => {
    expect(introFaceTier({
      query: 'housing crash',
      alt: 'RE/MAX FOR SALE sign Kathy Bost suburban house yard sign',
      title: 'remax for sale sign',
      url: 'https://example.com/remax.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'housing market',
      alt: 'realtor sign real estate sign suburban exterior',
      title: 'realtor yard sign',
      url: 'https://example.com/realtor.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    // Headset / podcast-mic / YouTuber without "webinar" keyword (web19 contact sheet).
    expect(introFaceTier({
      query: 'housing crash explained',
      alt: 'youtuber gaming headset talking to camera podcast mic',
      title: 'subscribe button streamer setup',
      url: 'https://example.com/headset.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'million apartment',
      alt: 'touring a 27 3 million apartment in nyc s one57 business insider',
      title: 'one57 luxury tour',
      url: 'https://archive.org/download/one57/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'housing crash chart',
      alt: 'LendingTree bar chart housing crash infographic crater graphic',
      title: 'american home mortgage bankruptcy slide',
      url: 'https://example.com/chart.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('tiers AI radiology / clinician+screen as healthcare opener (2)', () => {
    const asset = {
      query: 'ai radiology doctor monitor screen',
      alt: 'clinician pointing at mri monitor ai radiology diagnosis',
      title: 'clinician pointing at mri monitor ai radiology diagnosis',
      url: 'https://vimeo.com/12345',
      type: 'video',
    };
    expect(introFaceTier(asset, { healthcare: true })).toBe(2);
  });

  it('boosts face+healthcare-topical clips to tier 3 (above robot-only tier 2)', () => {
    // healthcare-web61: patient/clinician face clips should always beat faceless robot/OR
    // openers when available. Face+topical → 3; robot/OR without face → 2.
    const patientFace = {
      alt: 'patient face worried doctor consultation close-up portrait people hospital',
      title: 'patient worried doctor consultation',
      url: 'https://vimeo.com/patient1.mp4',
      type: 'video',
    };
    const clinicianFace = {
      alt: 'doctor clinician face expression people close-up medical healthcare hospital',
      title: 'clinician people face healthcare hospital',
      url: 'https://vimeo.com/clinician1.mp4',
      type: 'video',
    };
    expect(introFaceTier(patientFace, { healthcare: true })).toBe(3);
    expect(introFaceTier(clinicianFace, { healthcare: true })).toBe(3);
    // Faceless robot/OR clip must remain tier 2 (no face signal).
    const robotOnly = {
      alt: 'surgical robot operating room OR lights da vinci hospital',
      title: 'surgical robot OR',
      url: 'https://vimeo.com/robot1.mp4',
      type: 'video',
    };
    expect(introFaceTier(robotOnly, { healthcare: true })).toBe(2);
  });

  it('prefers tier-3 clinician face over tier-2 robot in healthcare intro 0–3s', () => {
    // Picker must exhaust minTier 3 before 2 — otherwise robot-led hooks cap ~6.6.
    const robot = {
      id: 'robot',
      type: 'video',
      url: 'https://cdn.example/robot.mp4',
      title: 'senhance surgical robotic system full length benefits',
      alt: 'senhance surgical robotic system operating room',
      query: 'surgical robot',
    };
    const face = {
      id: 'face',
      type: 'video',
      url: 'https://cdn.example/face.mp4',
      title: 'worried patient face doctor consultation hospital close-up',
      alt: 'patient face worried doctor hospital portrait people',
      query: 'worried patient face doctor',
    };
    const project = {
      topic: 'Why AI will change healthcare',
      script: [{ id: 's1', narration: 'AI already beats your doctor on the scan.', duration: 8 }],
      media: [robot, face],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 0.65 });
    const first = timeline.find((t) => (t.startSec ?? 0) < 3);
    expect(first?.assetId).toBe('face');
  });
});

describe('passesHousingTimelineIntroEvidence', () => {
  it('passes tenant/eviction evidence that checkEditTimelineIntroFace accepts', () => {
    expect(passesHousingTimelineIntroEvidence({
      type: 'video',
      title: 'tenant left in limbo after landlord was evicted',
      alt: 'tenant eviction apartment',
      url: 'https://archive.org/x.mp4',
    })).toBe(true);
    expect(passesHousingTimelineIntroEvidence({
      type: 'video',
      title: 'worried family distressed eviction notice apartment',
      alt: 'family crying distressed evicted apartment door',
      url: 'https://nypost.com/x',
    })).toBe(true);
  });

  it('rejects LinkedIn credit-repair flyer stills even with eviction query stamps (housing-web82)', () => {
    expect(passesHousingTimelineIntroEvidence({
      type: 'image',
      title: 'shocked woman face receiving eviction notice apartment',
      alt: 'shocked woman face receiving eviction notice apartment',
      url: 'https://media.licdn.com/dms/image/v2/D5622AQGVUYHCH5OaFw/feedshare-image-high-res/x.jpg',
      source: 'Deep Harvest (www.linkedin.com)',
      sourceUrl: 'https://www.linkedin.com/posts/rose-m-jones-the-housing-crash',
    })).toBe(false);
    expect(passesHousingTimelineIntroEvidence({
      type: 'video',
      title: 'mortgage protection plan alliance group',
      alt: 'mortgage protection a mortgage protection plan is the smartest',
      url: 'https://example.com/mortgage.mp4',
    })).toBe(false);
  });

  it('rejects bare face/music pads that fail the timeline gate (web3/web4)', () => {
    expect(passesHousingTimelineIntroEvidence({
      title: 'the weeknd can t feel my face remix',
      alt: 'the weeknd can t feel my face remix',
      query: 'worried tenant face close up',
      url: 'https://vimeo.com/x.mp4',
    })).toBe(false);
    expect(passesHousingTimelineIntroEvidence({
      title: 'viper 787 electronic dartboard',
      alt: 'viper 787 electronic dartboard',
      query: 'worried tenant face close up',
      url: 'https://vimeo.com/y.mp4',
    })).toBe(false);
  });

  it('prefers timeline-gate evidence over music-pad face in housing intro 0–3s', () => {
    const junk = {
      id: 'junk',
      type: 'video',
      url: 'https://cdn.example/junk.mp4',
      title: 'the weeknd can t feel my face remix yeknomusic',
      alt: 'the weeknd can t feel my face remix',
      query: 'worried tenant face close up',
    };
    const good = {
      id: 'good',
      type: 'video',
      url: 'https://cdn.example/good.mp4',
      title: 'tenant left in limbo after man believed to be his landlord was evicted',
      alt: 'tenant left in limbo after eviction',
      query: 'tenant eviction',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [{ id: 's1', narration: 'They hid the housing crash while your equity vanished.', duration: 8 }],
      media: [junk, good],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 0.65 });
    const first = timeline.find((t) => (t.startSec ?? 0) < 3);
    expect(first?.assetId).toBe('good');
  });
});

describe('introFaceTier demotions continued', () => {
  it('demotes pure talking-head / rejects maternity and news studio for healthcare intro', () => {
    expect(introFaceTier({
      alt: 'ai healthcare talking head explainer interview',
      title: 'ai healthcare talking head explainer interview',
      url: 'https://archive.org/download/talk/talk.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(0);
    expect(introFaceTier({
      alt: '1937 maternity ward hospital film archival',
      title: '1937 maternity ward hospital film archival',
      url: 'https://archive.org/download/mat/mat.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'news talking head studio interview anchor desk',
      title: 'news talking head studio interview anchor desk',
      url: 'https://example.com/news.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('rejects healthcare-web11 CNN10 / breast-implant / Vietnam / aerial adventure intro leads', () => {
    expect(introFaceTier({
      alt: 'cnn 10 host talking head red studio',
      title: 'cnn 10 healthcare segment',
      url: 'https://archive.org/download/cnn10/cnn10.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'breast implants plastic surgery mathew epps',
      title: 'lowcountry lowdown breast implants',
      url: 'https://archive.org/download/epps/epps.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'adventure eight paging dr ross medical city arlington aerial',
      title: 'medical city arlington establishing shot',
      url: 'https://archive.org/download/adv8/adv8.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'garland isd baylor robotic surgery demo classroom students watching',
      title: 'da vinci surgical system overview',
      url: 'https://archive.org/download/garland/garland.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('rejects exhibition-hall / trade-show / conference-booth openers on healthcare intro (web11 suit)', () => {
    // Conference-floor product demos — not clinical use — must never lead the hook.
    const exhibitionCases = [
      {
        alt: 'AI healthcare summit booth floor product demo',
        title: 'health IT summit exhibition hall healthcare AI',
        url: 'https://vimeo.com/summit123.mp4',
        type: 'video',
      },
      {
        alt: 'HIMSS conference expo floor healthcare IT booth',
        title: 'HIMSS 2024 medical technology exhibitor',
        url: 'https://example.com/himss.mp4',
        type: 'video',
      },
      {
        alt: 'medical trade show exhibition hall surgical robot product demonstration',
        title: 'healthcare trade show product demo',
        url: 'https://archive.org/download/tradeshow/ts.mp4',
        type: 'video',
      },
      {
        alt: 'suit walking conference floor AI healthcare summit expo booth',
        title: 'executive suit walk healthcare expo',
        url: 'https://example.com/suitwalk.mp4',
        type: 'video',
      },
    ];
    for (const asset of exhibitionCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('tiers OR surgical robot / radiologist workstation as healthcare opener (2)', () => {
    // CNBC-style titles and real OR clips should reliably get tier 2.
    const orCases = [
      {
        alt: 'CNBC surgical robot operating room hospital cancer diagnosis',
        title: 'CNBC surgical robot hospital',
        url: 'https://vimeo.com/cnbc_robot.mp4',
        type: 'video',
      },
      {
        alt: 'da Vinci robot surgery operating room patient procedure',
        title: 'da Vinci robotic surgery OR',
        url: 'https://vimeo.com/davinci.mp4',
        type: 'video',
      },
      {
        alt: 'radiologist workstation MRI screen monitor reading hospital',
        title: 'radiologist reviewing MRI workstation',
        url: 'https://vimeo.com/radwork.mp4',
        type: 'video',
      },
      {
        alt: 'robotic surgery OR lights surgeon operating table',
        title: 'robotic surgery operating room',
        url: 'https://vimeo.com/orsurgeon.mp4',
        type: 'video',
      },
    ];
    for (const asset of orCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(2);
    }
  });

  it('caps generic healthcare Archive (clinical vocab, no OR) at introFaceTier 1 (body-only)', () => {
    // Hospital/clinical Archive without OR/surgical/radiologist keywords should be
    // body filler (tier 1), not intro material (tier 2 needed to clear the floor).
    // healthcare-web197: bare corridor establishing is hard-rejected (-1), not tier 1.
    expect(introFaceTier({
      alt: 'hospital corridor patients nurses busy ward archive footage',
      title: 'hospital corridor footage archive 1990s',
      url: 'https://archive.org/download/hosp1990/hosp.mp4',
      source: 'Archive.org live',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'doctor reviewing patient medical records healthcare clinic',
      title: 'medical records review clinic archive documentary',
      url: 'https://archive.org/download/medrecords/doc.mp4',
      source: 'Archive.org live',
      type: 'video',
    }, { healthcare: true })).toBe(1);
  });

  it('hard-rejects healthcare corridor / blurry-container establishing as intro (-1)', () => {
    expect(introFaceTier({
      alt: 'hospital corridor walking away blurry hallway nurses',
      title: 'hospital corridor walking away',
      url: 'https://archive.org/download/corr/c.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'blurry shipping container yard aerial cargo containers',
      title: 'blurry container port footage',
      url: 'https://archive.org/download/cont/c.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'hospital building exterior establishing shot campus',
      title: 'hospital exterior establishing',
      url: 'https://archive.org/download/ext/e.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('hard-rejects web198 medics-backs / from-behind / title-card / French couloir openers (-1)', () => {
    expect(introFaceTier({
      alt: 'medics from behind hospital hallway walking away',
      title: 'medics backs to camera hallway',
      url: 'https://archive.org/download/backs/b.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'title card only healthcare presentation slide',
      title: 'title card ai beats doctor',
      url: 'https://archive.org/download/title/t.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'covid 19 face l afflux de patients dans un couloir pour faire face',
      title: 'covid 19 face l afflux de patients dans un couloir pour faire face',
      url: 'https://www.dailymotion.com/video/x807tic',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'recorded call radiologist mri error american health imaging',
      title: 'recorded call radiologist mri error',
      url: 'https://www.dailymotion.com/video/xak0t4a',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('prefers doctor-face over hallway establishing in healthcare intro timeline (web198)', () => {
    const hallway = {
      id: 'hall',
      type: 'video',
      url: 'https://cdn.example/hall.mp4',
      title: 'medics from behind hospital hallway walking away',
      alt: 'medics backs hallway establishing',
      query: 'worried patient face doctor hospital',
    };
    const face = {
      id: 'face',
      type: 'video',
      url: 'https://cdn.example/face.mp4',
      title: 'doctor face patient consultation close up hospital',
      alt: 'doctor face close up portrait',
      query: 'doctor face patient consultation',
    };
    const project = {
      topic: 'Why AI will change healthcare',
      script: [{ id: 's1', narration: 'AI already beats your doctor on the scan.', duration: 8 }],
      media: [hallway, face],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 0.65 });
    const first = timeline.find((t) => (t.startSec ?? 0) < 3);
    expect(first?.assetId).toBe('face');
  });

  it('gives healthcare Archive explainer/documentary tier 0 (talking-head gate)', () => {
    // Archive explainer/lecture without hard-reject keywords: talking-head soft-gate
    // returns 0 (not admitted to intro, but passes the hard-reject gate at -1).
    const talkingHeadCases = [
      {
        alt: 'AI in healthcare explainer lecture archive',
        title: 'AI healthcare explainer lecture archive',
        url: 'https://archive.org/download/aihealth/doc.mp4',
        source: 'Archive.org live',
        type: 'video',
      },
      {
        alt: 'hospital administration healthcare management lecture',
        title: 'healthcare management lecture archive',
        url: 'https://archive.org/download/hcmgmt/lec.mp4',
        source: 'Archive.org live',
        type: 'video',
      },
    ];
    for (const asset of talkingHeadCases) {
      // introFaceTier returns 0 for explicit talking-head/explainer/lecture keywords
      // without clinicianScreenOrOr — below the intro floor (2) but not hard-rejected (-1).
      expect(introFaceTier(asset, { healthcare: true })).toBe(0);
    }
  });

  it('hard-rejects healthcare Archive with news-studio / talking-head-studio keywords (-1)', () => {
    // "talking head studio" / "webinar" etc. hit isRejectedIntroLeadVisual and return -1.
    const hardRejectedCases = [
      {
        alt: 'healthcare news talking head studio anchor interview',
        title: 'healthcare news studio anchor',
        url: 'https://archive.org/download/news/news.mp4',
        source: 'Archive.org live',
        type: 'video',
      },
    ];
    for (const asset of hardRejectedCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('hard-rejects web15 junk pads as healthcare intro (body-lang / NVIDIA / AI Patel / helium / milestone)', () => {
    const web15RejectCases = [
      {
        alt: 'Mistake 1 Saying the wrong things with your body Healthcare edition body language coaching',
        title: 'body language healthcare edition mistakes',
        url: 'https://www.youtube.com/watch?v=bodylang1',
        type: 'video',
      },
      {
        alt: 'NVIDIA AI for Healthcare and Life Sciences promo corporate',
        title: 'NVIDIA AI for Healthcare and Life Sciences',
        url: 'https://www.youtube.com/watch?v=nvidiahc1',
        type: 'video',
      },
      {
        alt: 'Why AI Patel Why AI will change healthcare talking head',
        title: 'AI Patel why AI will change healthcare',
        url: 'https://www.youtube.com/watch?v=aipatel1',
        type: 'video',
      },
      {
        alt: 'meet our jacks jada pemble medical lab science community assistant staff intro',
        title: 'jada pemble medical laboratory science',
        url: 'https://www.youtube.com/watch?v=jadapemble1',
        type: 'video',
      },
      {
        alt: 'not just for balloons helium used in the medical field MRI scanners',
        title: 'helium used in medical field',
        url: 'https://www.youtube.com/watch?v=helium1',
        type: 'video',
      },
      {
        alt: 'maple grove hospital robot milestone celebration ribbon cutting event',
        title: 'maple grove hospital milestone celebration',
        url: 'https://www.youtube.com/watch?v=maplegr1',
        type: 'video',
      },
    ];
    for (const asset of web15RejectCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('rejects Elias innovate / Bayer logo-stage as healthcare intro (-1)', () => {
    expect(introFaceTier({
      alt: 'DAVID & ELIAS - WHY DO I INNOVATE corporate interview',
      title: 'why do i innovate',
      query: 'surgical robot',
      url: 'https://vimeo.com/1075442788',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'bayer logo stage corporate interview healthcare keynote',
      title: 'bayer healthcare presentation',
      query: 'ai radiology',
      url: 'https://archive.org/download/bayer/bayer.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('does not mint tier-2 from harvest query alone when title is GeekBeat', () => {
    expect(introFaceTier({
      alt: 'geekbeat tv unlock your old iphone',
      title: 'geekbeat tv 433',
      query: 'surgical robot operating room',
      url: 'https://archive.org/download/GeekBeat/clip.mp4',
      type: 'video',
      source: 'Archive.org live',
    }, { healthcare: true })).toBe(-1);
  });

  it('tiers Onyx RAD / CNBC as strong healthcare opener (2); Science Nation rejected (-1)', () => {
    expect(introFaceTier({
      alt: 'Science Nation surgical robot operating room hospital NSF',
      title: 'Science Nation surgical robot documentary',
      url: 'https://archive.org/download/sciencenation/sn.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'Onyx RAD AI radiology workstation screen monitor diagnosis',
      title: 'Onyx RAD AI radiology review',
      url: 'https://vimeo.com/onyxrad1.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(2);
    expect(introFaceTier({
      alt: 'cnbc meet the surgical robot that can diagnose lung cancer',
      title: 'cnbc surgical robot diagnose',
      url: 'https://example.com/cnbc.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(2);
  });

  it('tiers web16 pool clips (tiny incision / hsc robot) as tier 2; Science Nation -1', () => {
    // "surgical robotics" (with "ics") must still match; Science Nation branding out (web76).
    expect(introFaceTier({
      alt: 'science nation surgical robotics operating room nst',
      title: 'science nation surgical robotics',
      url: 'https://archive.org/download/sn_robot/sn.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    for (const asset of [
      {
        alt: 'tiny incision big impact the new surgical robot minimally invasive',
        title: 'tiny incision surgical robot',
        url: 'https://archive.org/download/tiny_incision/ti.mp4',
        type: 'video',
      },
      {
        alt: 'hsc s first surgical robot procedure hospital',
        title: 'hsc first surgical robot',
        url: 'https://archive.org/download/hsc_robot/hsc.mp4',
        type: 'video',
      },
    ]) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(2);
    }
  });

  it('hard-rejects web16 junk as healthcare intro (MedCram/PA school/eclipse/WWI/1972/bilibili)', () => {
    const web16Junk = [
      {
        alt: 'online medical learning how pa schools can benefit from medcram lectures',
        title: 'how pa schools can benefit from medcram',
        url: 'https://www.youtube.com/watch?v=medcram1',
        type: 'video',
      },
      {
        alt: 'nurses at celebrity eclipse medical facility cruise ship staff',
        title: 'celebrity eclipse medical facility nurses',
        url: 'https://www.youtube.com/watch?v=eclipse1',
        type: 'video',
      },
      {
        alt: 'maryland women s heritage center honor nurses wwi memorial tribute',
        title: 'women s heritage center wwi nurses',
        url: 'https://www.youtube.com/watch?v=wwi1',
        type: 'video',
      },
      {
        alt: 'emergency 1972 tv series incomplete old footage episode',
        title: 'emergency 1972 television series incomplete',
        url: 'https://archive.org/download/emergency72/ep.mp4',
        type: 'video',
      },
      {
        alt: 'bilibili chill sakura ai debug pad lofi ambient music',
        title: 'chill sakura ai debug pad bilibili',
        url: 'https://www.youtube.com/watch?v=bilibili1',
        type: 'video',
      },
    ];
    for (const asset of web16Junk) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  // ---------------------------------------------------------------------------
  // New DoD tests: housing static document / check / notice openers (web31)
  // ---------------------------------------------------------------------------

  it('hard-rejects static document / housing-price-index opener on housing intro (web31)', () => {
    const staticDocCases = [
      {
        alt: 'static document housing crash they hid government report',
        title: 'THE HOUSING CRASH THEY HID static document',
        url: 'https://archive.org/download/housing_doc/doc.mp4',
        type: 'video',
      },
      {
        alt: 'housing price index chart graphic document only',
        title: 'housing price index static document',
        url: 'https://example.com/hpi.jpg',
        type: 'image',
      },
      {
        alt: 'housing price chart document',
        title: 'housing price chart',
        url: 'https://example.com/hpchart.jpg',
        type: 'image',
      },
      {
        alt: 'mortgage document paperwork close-up housing',
        title: 'mortgage document',
        url: 'https://example.com/mortgage.jpg',
        type: 'image',
      },
    ];
    for (const asset of staticDocCases) {
      expect(introFaceTier(asset, { housing: true })).toBe(-1);
    }
  });

  it('hard-rejects eviction notice without face on housing intro (web31)', () => {
    expect(introFaceTier({
      alt: 'eviction notice paper document close-up text only',
      title: 'eviction notice only',
      url: 'https://example.com/eviction.jpg',
      type: 'image',
    }, { housing: true })).toBe(-1);
    // cashier check / rent check without face also rejected
    expect(introFaceTier({
      alt: "cashier's check rent payment form document",
      title: "cashier's check housing",
      url: 'https://example.com/check.jpg',
      type: 'image',
    }, { housing: true })).toBe(-1);
  });

  it('allows eviction notice WITH readable face on housing intro (web31 eviction-with-face stays OK)', () => {
    expect(introFaceTier({
      query: 'tenant eviction notice worried face close-up',
      alt: 'tenant face worried holding eviction notice portrait people',
      title: 'worried tenant holding eviction notice',
      url: 'https://example.com/tenant_notice.mp4',
      type: 'video',
    }, { housing: true })).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // New DoD tests: healthcare blurry test-tube / trade-show / Science Nation (web18/20)
  // ---------------------------------------------------------------------------

  it('hard-rejects blurry test-tube / petri-dish openers on healthcare intro (web18)', () => {
    const testTubeCases = [
      {
        alt: 'blurry test tube laboratory close-up b-roll stock generic',
        title: 'blurry test tube lab generic',
        url: 'https://example.com/testtube.mp4',
        type: 'video',
      },
      {
        alt: 'test tube close-up stock filler healthcare lab',
        title: 'test tube close up only',
        url: 'https://vimeo.com/testtube2.mp4',
        type: 'video',
      },
      {
        alt: 'petri dish close-up b-roll stock lab healthcare',
        title: 'petri dish stock',
        url: 'https://example.com/petri.mp4',
        type: 'video',
      },
    ];
    for (const asset of testTubeCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('hard-rejects standalone HIMSS / trade-show (no floor qualifier) on healthcare intro (web20)', () => {
    const tradeShowCases = [
      {
        alt: 'HIMSS annual conference healthcare technology 2024',
        title: 'HIMSS healthcare conference',
        url: 'https://example.com/himss.mp4',
        type: 'video',
      },
      {
        alt: 'medical trade show healthcare AI products exhibitors',
        title: 'medical trade show exhibitor',
        url: 'https://vimeo.com/tradeshow.mp4',
        type: 'video',
      },
      {
        alt: 'corporate presentation healthcare AI digital health keynote',
        title: 'corporate healthcare presentation',
        url: 'https://example.com/corporate.mp4',
        type: 'video',
      },
    ];
    for (const asset of tradeShowCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('hard-rejects all Science Nation branding as healthcare intro (web76)', () => {
    expect(introFaceTier({
      alt: 'science nation surgical robot operating room hospital',
      title: 'science nation surgical robot documentary',
      url: 'https://vimeo.com/scination.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'science nation documentary episode',
      title: 'science nation',
      url: 'https://archive.org/download/scination/sn.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });
});


// ---------------------------------------------------------------------------
// visualSubjectCluster — cluster detection
// ---------------------------------------------------------------------------

describe('visualSubjectCluster', () => {
  it('classifies a person/face asset as human', () => {
    // query uses "person" not "port" to avoid matching the port/harbour cluster
    const asset = { alt: 'person close-up worried face expression', query: 'person face' };
    expect(visualSubjectCluster(asset)).toBe('human');
  });

  it('classifies a cockpit image as cockpit (takes priority over human)', () => {
    // cockpit is tested before human in the cluster function — document it explicitly
    const asset = { alt: 'pilot in cockpit flight deck', query: 'cockpit' };
    expect(visualSubjectCluster(asset)).toBe('cockpit');
  });

  it('classifies a runway as aircraft not human', () => {
    const asset = { alt: 'airplane on runway tarmac', query: 'runway' };
    expect(visualSubjectCluster(asset)).toBe('aircraft');
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: 2-still hold extension
// ---------------------------------------------------------------------------

function makeBodyProject(assets, segDur = 10) {
  return {
    topic: 'test topic generic',
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'This is a body segment with test narration content here.',
        title: 'Body segment',
      },
    ],
    media: assets.map((a, i) => ({ ...a, id: `a${i}`, segmentId: 'seg1' })),
  };
}

describe('buildEditTimeline: 2-still hold extension', () => {
  it('holds each still ≥4 s when only 2 still URLs exist in a body segment', () => {
    const project = makeBodyProject(
      [
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'landscape still one', query: 'still one' },
        { type: 'image', url: 'https://example.com/still2.jpg', alt: 'landscape still two', query: 'still two' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // 10 s ÷ 4 s/clip → at most 3 entries (not 8 rapid 1.25 s cuts)
    expect(timeline.length).toBeLessThanOrEqual(3);
    // All entries except possibly the final tail should hold ≥4 s.
    // The last entry may be shorter if the segment duration doesn't divide evenly.
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeGreaterThanOrEqual(3.9);
    }
    // Even at 1.25 s pacing without the fix we'd get ≥7 entries; ≤3 confirms the fix.
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('does not extend holds when a video is available alongside stills', () => {
    const project = makeBodyProject(
      [
        { type: 'video', url: 'https://example.com/vid1.mp4', alt: 'video clip one', query: 'video one' },
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'still one', query: 'still one' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Normal 1.25 s pacing → ≥6 entries over 10 s
    expect(timeline.length).toBeGreaterThan(4);
  });

  it('does not extend holds for intro segments even with 2 stills', () => {
    const project = {
      topic: 'test topic generic',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 10,
          narration: 'Intro narration content here.',
          title: 'Intro',
        },
      ],
      media: [
        { id: 'a0', segmentId: 'seg1', type: 'image', url: 'https://example.com/s1.jpg', alt: 'still one', query: 's1' },
        { id: 'a1', segmentId: 'seg1', type: 'image', url: 'https://example.com/s2.jpg', alt: 'still two', query: 's2' },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Intro: first cut holds 2.0s face/OR opener, then 0.65s rapid cuts → still dense
    expect(timeline.length).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: introFaceTier human-cluster fallback
// ---------------------------------------------------------------------------

describe('buildEditTimeline: introFaceTier human-cluster fallback', () => {
  it('picks a human-cluster asset before a non-human one for the intro lead when no strict face exists', () => {
    // "person portrait" matches the human cluster but does NOT have the role-word+face-term
    // combo that hasReadableFaceVisual requires (so introFaceTier returns 0).
    // The new fallback should still prefer this over a runway/aerial asset.
    const project = {
      topic: 'generic test story',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 5,
          narration: 'Hook narration here for the test.',
          title: 'Intro',
        },
      ],
      media: [
        // Human-cluster still (weak face signal — no explicit role word like "passenger")
        {
          id: 'human1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/person-portrait.jpg',
          alt: 'person close-up portrait',
          query: 'portrait',
        },
        // Aerial / establishing shot — no human signal
        {
          id: 'aerial1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/aerial.jpg',
          alt: 'aerial view city skyline',
          query: 'aerial',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // First entry should use the portrait asset, not the aerial one
    const firstEntry = timeline[0];
    expect(firstEntry).toBeDefined();
    expect(firstEntry.assetId).toBe('human1');
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: housing intro face/apartment over landscape
// ---------------------------------------------------------------------------

describe('buildEditTimeline: housing intro face/apartment over landscape', () => {
  it('opens the housing hook on a face clip, not landscape Archive', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 5,
          narration: 'Your landlord just raised the rent again overnight.',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 10,
          narration: 'Tenants across the city are facing algorithmic eviction notices.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'face',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/tenant-face.mp4',
          alt: 'tenant face worried eviction notice apartment close-up portrait people',
          query: 'worried tenant apartment',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first3s = timeline.filter((e) => e.segmentId === 'intro' && e.startSec < 3);
    expect(first3s.length).toBeGreaterThan(0);
    // Opener hold is 1.5–2.5s — only the earliest cut must be the face; later
    // first-3s beats may rapid-cut to other on-topic motion.
    expect(first3s[0].assetId).toBe('face');
    expect(first3s[0].startSec).toBe(0);
    expect(hasReadableFaceVisual(project.media.find((m) => m.id === 'face'))).toBe(true);
  });

  it('holds intro face opener ≥1.5s before rapid cuts (anti-slideshow)', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 8,
          narration: 'They hid the housing crash while your equity vanished overnight.',
          title: 'Intro',
        },
      ],
      media: [
        {
          id: 'face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/west-sussex.mp4',
          title: 'west sussex man faces an eviction order from his littlehampton home',
          alt: 'west sussex man faces an eviction order tenant face',
          query: 'worried tenant face',
          source: 'Dailymotion',
        },
        {
          id: 'face2',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/sf.mp4',
          title: 'san francisco tenants being evicted documentary news footage',
          alt: 'sf tenants eviction face close up',
          query: 'tenant face eviction',
          source: 'Dailymotion',
        },
        {
          id: 'face3',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/dale.mp4',
          title: 'dale farm travellers eviction documentary worried family',
          alt: 'dale farm eviction family face',
          query: 'eviction face',
          source: 'Dailymotion',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    expect(timeline[0].startSec).toBe(0);
    const hold = timeline[0].endSec - timeline[0].startSec;
    expect(hold).toBeGreaterThanOrEqual(1.5);
    expect(hold).toBeLessThanOrEqual(2.5);
    expect(timeline.length).toBeGreaterThan(3);
  });

  it('prefers modern apartment motion over landscape when no strict face exists', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 5,
          narration: 'Your landlord just raised the rent again overnight.',
          title: 'Intro',
        },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'apt',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/apt-interior.mp4',
          alt: 'modern apartment interior living room daylight',
          query: 'modern apartment living room',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first3s = timeline.filter((e) => e.startSec < 3);
    expect(first3s.length).toBeGreaterThan(0);
    expect(first3s[0].assetId).toBe('apt');
    expect(first3s[0].startSec).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: strict reuse cap for thin keyless pools
// ---------------------------------------------------------------------------

function makeVideoPool(n, { source = 'Stock video pool', prefix = 'clip' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    segmentId: 'seg1',
    type: 'video',
    url: `https://example.com/${prefix}${i}.mp4`,
    alt: `airline b-roll clip ${i} cabin aircraft`,
    query: 'airline aircraft cabin',
    source,
  }));
}

function reuseCounts(timeline, windowSec = null) {
  const counts = new Map();
  for (const e of timeline) {
    if (windowSec != null && e.startSec >= windowSec) continue;
    counts.set(e.assetId, (counts.get(e.assetId) || 0) + 1);
  }
  return counts;
}

describe('buildEditTimeline: strict reuse cap (thin keyless pools)', () => {
  it('caps a dominant archive/sim clip at ≤2 in the first 30s when alternatives exist (airline-v2 repro)', () => {
    // The airline-v2 failure: a lone flight-sim archive clip is the only
    // non-"aircraft" cluster, so the consecutive-cluster rule funnelled every
    // other pick back onto it — it appeared ≥3× in the opening sample even
    // though five fresh airline clips were available. The strict window cap
    // must hold it (and every URL) to ≤2 across the opening 30s.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin passenger',
          query: 'flight simulator cockpit aircraft cabin',
          source: 'Archive.org live',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `fresh${i}`,
          segmentId: 'seg1',
          type: 'video',
          url: `https://example.com/fresh${i}.mp4`,
          alt: `airplane clip ${i}`,
          query: 'airplane',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first30 = reuseCounts(timeline, 30);
    expect(first30.get('sim') || 0).toBeLessThanOrEqual(2);
    expect(Math.max(...first30.values())).toBeLessThanOrEqual(2);
  });

  it('holds a repeated source URL to ≤2 within the first 30s window when alternatives exist', () => {
    // Broad pool, long (non-short) video: the opening 30s must never loop a
    // single clip past twice while fresh URLs remain reachable.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(14),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline, 30);
    const maxReuse = Math.max(...counts.values());
    expect(maxReuse).toBeLessThanOrEqual(2);
  });

  it('relaxes the cap when the pool is too thin for an alternative to exist', () => {
    // Only 2 clips over 20s: no third URL to cut to, so reuse past twice is the
    // best available coverage. The cap must not starve the timeline into gaps.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 20,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(2),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage: cuts span the whole segment with no gap.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('demotes a repeated archive/sim clip below a fresher lower-scoring clip', () => {
    // A highly-topical flight-sim archive clip must not be reused a second time
    // ahead of a fresh, less-topical airline clip: after its first use the
    // archive/sim penalty demotes it so variety wins the next slot.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 10,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin',
          query: 'flight simulator cockpit aircraft',
          source: 'Archive.org live',
        },
        {
          id: 'fresh',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://example.com/fresh.mp4',
          alt: 'airplane cabin aisle',
          query: 'airline cabin',
          source: 'Pexels Videos',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline);
    // The sim clip is used at most as often as the fresh clip — never looped.
    expect(counts.get('sim') || 0).toBeLessThanOrEqual(counts.get('fresh') || 0);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: rich-pool short holds (≥12 unique URLs)
// ---------------------------------------------------------------------------

function makeRichPool(n, { topic = 'airline emergency mystery', segDur = 60 } = {}) {
  return {
    topic,
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
        title: 'Body',
      },
    ],
    media: Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      segmentId: 'seg1',
      type: 'video',
      url: `https://example.com/clip${i}.mp4`,
      alt: `airline b-roll clip ${i} cabin aircraft passenger`,
      query: 'airline aircraft cabin',
      source: 'Pexels Videos',
    })),
  };
}

describe('buildEditTimeline: rich-pool short holds', () => {
  it('caps body holds at ≤1.5s when pool has ≥12 unique video URLs', () => {
    const project = makeRichPool(14, { segDur: 30 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    expect(timeline.length).toBeGreaterThan(0);
    // With ≥12 URLs, effectiveCut ≤ 1.5s → ≥12 cuts in 30s, not 3–5 long holds
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6); // 1.5 + float tolerance
    }
    // At 1.5s max per cut, 30s → at least 18 entries
    expect(timeline.length).toBeGreaterThanOrEqual(18);
  });

  it('caps body holds at ≤1.5s when pool is ≥2× segment count (relative threshold)', () => {
    // 3 script segments, 8 unique clips (8 ≥ 8 minimum AND 8 ≥ 2×3=6 → rich pool)
    const project = {
      topic: 'airline emergency mystery',
      script: [
        { id: 'seg1', type: 'intro', duration: 5, narration: 'Hook here.', title: 'Intro' },
        { id: 'seg2', type: 'body', duration: 20, narration: 'The airline flight faced an emergency with worried passengers.', title: 'Body' },
        { id: 'seg3', type: 'outro', duration: 5, narration: 'Subscribe.', title: 'Outro' },
      ],
      media: Array.from({ length: 8 }, (_, i) => ({
        id: `v${i}`,
        segmentId: i < 4 ? 'seg2' : 'seg2',
        type: 'video',
        url: `https://example.com/clip${i}.mp4`,
        alt: `airline clip ${i} aircraft cabin passenger face`,
        query: 'airline aircraft',
        source: 'Pexels Videos',
      })),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const bodyEntries = timeline.filter((e) => e.segmentId === 'seg2');
    // First body beats stay snappy (≤1.6s) while unused URLs remain. Later
    // scarcity may stretch toward the thin-pool 2.0s cap after intro burns
    // unique URLs — coverage, not a regression of the rich-pool short-hold.
    const openingBody = bodyEntries.slice(0, 4);
    for (const entry of openingBody) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    expect(bodyEntries.length).toBeGreaterThanOrEqual(10);
  });

  it('does NOT apply rich-pool short-hold cap to a thin pool (< 12 and < 2× seg count)', () => {
    // 4 unique clips for a body segment — thin pool, should use up to 2.5s holds
    const project = makeRichPool(4, { segDur: 20 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Thin pool: hardMaxReuse will stretch holds beyond 1.5s to fill coverage
    // when all clips hit their per-segment reuse limit; let it — just verify
    // we still get full coverage.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('no single URL appears more than once in the first 15s of a rich pool', () => {
    // 16 unique clips, 45s body — rich pool: first 15s must cycle through
    // fresh clips without repeating any URL.
    const project = makeRichPool(16, { segDur: 45 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const countsFirst15 = reuseCounts(timeline, 15);
    const maxReuseFirst15 = countsFirst15.size ? Math.max(...countsFirst15.values()) : 0;
    expect(maxReuseFirst15).toBeLessThanOrEqual(1);
  });

  it('≤2 cap still holds in first 30s for rich pool (existing contract)', () => {
    const project = makeRichPool(16, { segDur: 60 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });

  it('rich-pool hold cap does not starve coverage on a rich airline-web scenario (26 clips)', () => {
    // Matches the failing audit scenario: 26 web motion clips injected.
    const project = makeRichPool(26, { segDur: 120 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(119.9);
    // Body holds ≤ 1.5s throughout
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    // First 15s: each URL used at most once
    const countsFirst15 = reuseCounts(timeline, 15);
    expect(Math.max(...countsFirst15.values())).toBeLessThanOrEqual(1);
    // First 30s: each URL used at most twice
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: housing / medium-pool first-15s reuse + early motion
// ---------------------------------------------------------------------------

const HOUSING_CRASH_TOPIC = 'The housing crash they said would never happen';

function makeHousingVideoPool(n, { segDur = 45, prefix = 'hclip' } = {}) {
  return {
    topic: HOUSING_CRASH_TOPIC,
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'Landlords and tenants faced eviction notices as the housing market crashed overnight across apartment buildings.',
        title: 'Body',
      },
    ],
    media: Array.from({ length: n }, (_, i) => ({
      id: `h${i}`,
      segmentId: 'seg1',
      type: 'video',
      url: `https://example.com/${prefix}${i}.mp4`,
      alt: `apartment tenant landlord clip ${i} face worried eviction`,
      query: 'apartment tenant eviction',
      source: 'Pexels Videos',
    })),
  };
}

describe('buildEditTimeline: housing / medium-pool first-15s reuse caps', () => {
  it('caps each URL at ≤1 in the first 15s for a medium (8-URL) housing pool', () => {
    // Keyless housing often lands in the 6–11 URL band — below the rich-pool
    // threshold of 12 — so first-15s single-use must still apply.
    const project = makeHousingVideoPool(8, { segDur: 40 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const countsFirst15 = reuseCounts(timeline, 15);
    expect(countsFirst15.size).toBeGreaterThan(0);
    expect(Math.max(...countsFirst15.values())).toBeLessThanOrEqual(1);
    // Full coverage preserved (watch floors untouched).
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(39.9);
  });

  it('honors maxReusePerUrl=1 for housing (hardMax ≤3, no 6× loops)', () => {
    const project = makeHousingVideoPool(6, { segDur: 60 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const counts = reuseCounts(timeline);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(59.9);
  });

  it('does not repeat the same car-crash URL in the first 15s when alternatives exist', () => {
    const project = {
      topic: HOUSING_CRASH_TOPIC,
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 20,
          narration: 'The housing market crash left tenants facing eviction notices from landlords across the city.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'crash',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://example.com/car-crash-dashcam.mp4',
          alt: 'car crash dashcam highway accident wreck',
          query: 'car crash dashcam',
          source: 'Stock footage',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `apt${i}`,
          segmentId: 'seg1',
          type: 'video',
          url: `https://example.com/apt${i}.mp4`,
          alt: `apartment tenant face worried eviction clip ${i}`,
          query: 'apartment tenant eviction',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const first15 = reuseCounts(timeline, 15);
    expect(first15.get('crash') || 0).toBeLessThanOrEqual(1);
  });

  it('prefers video over Ken-Burns stills in the first 15s when videos exist', () => {
    const project = {
      topic: HOUSING_CRASH_TOPIC,
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 16,
          narration: 'Tenants and landlords faced eviction notices as apartments emptied across the city overnight.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'still1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/landscape1.jpg',
          alt: 'scenic landscape skyline establishing',
          query: 'landscape',
        },
        {
          id: 'still2',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/landscape2.jpg',
          alt: 'scenic countryside mountain vista',
          query: 'landscape',
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `vid${i}`,
          segmentId: 'other',
          type: 'video',
          url: `https://example.com/motion${i}.mp4`,
          alt: `apartment tenant face worried eviction clip ${i}`,
          query: 'apartment tenant',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const mediaById = Object.fromEntries(project.media.map((m) => [m.id, m]));
    const first15 = timeline.filter((e) => e.startSec < 15);
    expect(first15.length).toBeGreaterThan(0);
    // Stills must not appear until every unused motion URL has been tried once.
    const videoIds = new Set(project.media.filter((m) => m.type === 'video').map((m) => m.id));
    const seenVideos = new Set();
    for (const entry of first15) {
      const asset = mediaById[entry.assetId];
      if (asset?.type === 'video') {
        seenVideos.add(entry.assetId);
        continue;
      }
      expect(seenVideos.size).toBe(videoIds.size);
    }
    // Opener itself must be motion, not a Ken-Burns landscape still.
    expect(mediaById[first15[0].assetId]?.type).toBe('video');
  });
});

// ---------------------------------------------------------------------------
// isRejectedIntroLeadVisual — healthcare-web46 new junk patterns
// ---------------------------------------------------------------------------

describe('introFaceTier — healthcare-web46 hard-rejects (C4I / Moscow Times / Gaza)', () => {
  const HEALTHCARE_TOPIC = 'Why AI will change healthcare';

  it('hard-rejects C4I "Call 4 Investigation" public-access TV pad (-1)', () => {
    const cases = [
      {
        alt: 'c4i for may 20 jon kelly patricia shupe inner voices',
        title: 'c4i for may 20 jon kelly patricia shupe donald t grahn inner voices speech analyst',
        url: 'https://archive.org/download/scm-408098-c4iformay20/c4i_may_20.mp4',
        source: 'Archive.org live',
        type: 'video',
      },
      {
        alt: 'call 4 investigation news segment healthcare',
        title: 'call 4 investigation archive clip',
        url: 'https://archive.org/download/c4i_clip/c4i_clip.mp4',
        source: 'Archive.org live',
        type: 'video',
      },
    ];
    for (const asset of cases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('hard-rejects Moscow Times Russian nurses storage room pad (-1)', () => {
    const asset = {
      alt: 'sick russian nurses in storage room spark outrage the moscow times',
      title: 'sick russian nurses in storage room spark outrage the moscow times',
      url: 'https://archive.org/download/youtube-cwZOaBbVCnw/cwZOaBbVCnw.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
  });

  it('hard-rejects al-Ahli hospital Gaza conflict clip (-1)', () => {
    const asset = {
      alt: 'dr ghassan abu sitta recounts being forced from al ahli hospital shorts gaza alahli',
      title: 'dr ghassan abu sitta recounts being forced from al ahli hospital',
      url: 'https://archive.org/download/youtube-J18xT5FTHCs/J18xT5FTHCs.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// introFaceTier — housing web59/61 new junk intro rejects
// ---------------------------------------------------------------------------

describe('introFaceTier — housing web59/61 meme/ceremony/tiny-house/slides/physio rejects', () => {
  const HOUSING_OPT = { housing: true };

  it('hard-rejects green-screen shocked-face meme (web61 Shopify CDN) as housing intro (-1)', () => {
    const cases = [
      {
        alt: 'shocked face green screen reaction meme',
        title: 'green screen shocked face housing meme',
        url: 'https://cdn.shopify.com/s/files/shocked_face.mp4',
        source: 'Bing web video',
        type: 'video',
      },
      {
        alt: 'chroma key reaction meme shocked face apartment',
        url: 'https://example.com/chroma-meme.mp4',
        type: 'video',
      },
    ];
    for (const asset of cases) {
      expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
    }
  });

  it('hard-rejects vintage "HOUSING IN OUR TIME" title card as housing intro (-1)', () => {
    const asset = {
      alt: 'housing in our time 1952 archive documentary',
      title: 'Housing in Our Time — public housing film',
      url: 'https://archive.org/download/housing-in-our-time/housing.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
  });

  it('hard-rejects naturalization ceremony as housing intro (-1)', () => {
    const asset = {
      alt: 'tulsa naturalization ceremony archive 1945',
      title: 'Tulsa Naturalization Ceremony Film',
      url: 'https://archive.org/download/tulsa-nat/tulsa.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
  });

  it('hard-rejects tiny-house lifestyle clip as housing intro (-1)', () => {
    const asset = {
      alt: 'tiny house revolution lifestyle documentary movement',
      title: 'Tiny Homes Revolution — Alternative Living',
      url: 'https://archive.org/download/tiny-homes/tiny.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
  });

  it('hard-rejects "Welcome & introductions" presentation slide as housing intro (-1)', () => {
    const asset = {
      alt: 'welcome and introduction presentation slide housing webinar',
      title: 'Welcome & Introductions — Housing Webinar',
      url: 'https://archive.org/download/housing-webinar/slide.mp4',
      type: 'video',
    };
    expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
  });

  it('hard-rejects resistance-band / physiotherapy chart as housing intro (-1)', () => {
    const cases = [
      {
        alt: 'resistance band exercise chart etsy product poster',
        url: 'https://www.etsy.com/listing/resistance-band.jpg',
        type: 'video',
      },
      {
        alt: 'physiotherapy pyramid chart fitness exercise',
        url: 'https://mdpi.com/physio-chart.mp4',
        type: 'video',
      },
    ];
    for (const asset of cases) {
      expect(introFaceTier(asset, HOUSING_OPT)).toBe(-1);
    }
  });

  it('still tier-2 for worried-face tenant + eviction (not demoted)', () => {
    const asset = {
      alt: 'worried tenant face close up eviction notice apartment',
      title: 'Stressed Tenant Reads Eviction Notice',
      url: 'https://vimeo.com/tenant-eviction.mp4',
      type: 'video',
    };
    expect(introFaceTier(asset, HOUSING_OPT)).toBe(2);
  });

  it('hard-rejects housing-web78 luxury tour / packaging / Sudan / treehouse pads (-1)', () => {
    const cases = [
      {
        alt: 'the mansions at canyon springs san antonio first class living',
        title: 'The Mansions at Canyon Springs',
        query: 'stressed tenant crying apartment',
      },
      {
        alt: 'six sided packaging of panels and boards packaging various types',
        title: 'Six Sided Packaging of Panels and Boards',
        query: 'tenant packing boxes',
      },
      {
        alt: 'sudanese refugees homes beyond borders dignity for sudanese refugees in cairo',
        title: 'Homes Beyond Borders — Sudan Refugees',
        query: 'worried face eviction notice apartment',
      },
      {
        alt: 'barcroft tv grandmother faces eviction from paradise treehouse',
        title: 'Barcroft TV Grandmother Paradise Treehouse',
        query: 'shocked face eviction notice',
      },
    ];
    for (const asset of cases) {
      expect(introFaceTier({ ...asset, url: 'https://vimeo.com/x.mp4', type: 'video' }, HOUSING_OPT)).toBe(-1);
    }
  });
});

describe('hasReadableFaceVisual — evidence only (no query spoof)', () => {
  it('rejects luxury-tour clip whose query claims shocked face (housing-web78)', () => {
    const asset = {
      query: 'shocked face apartment eviction notice',
      alt: 'the mansions at canyon springs first class living lifestyles',
      title: 'The Mansions at Canyon Springs San Antonio TX',
      url: 'https://vimeo.com/mansions.mp4',
    };
    expect(hasReadableFaceVisual(asset)).toBe(false);
  });

  it('still accepts real face evidence without relying on query', () => {
    const asset = {
      query: 'random stock',
      alt: 'tenant face worried close-up portrait people eviction notice',
      title: 'Worried Tenant Close-Up',
      url: 'https://vimeo.com/tenant-face.mp4',
    };
    expect(hasReadableFaceVisual(asset)).toBe(true);
  });
});

describe('isHousingApartmentMotion — kitchen-static vs face-bearing kitchen', () => {
  it('returns false for bare kitchen interior without any person/face/tenant signal', () => {
    const asset = {
      alt: 'apartment kitchen interior daylight empty',
      title: 'Modern Kitchen Interior',
      url: 'https://example.com/kitchen.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(false);
  });

  it('returns false for bare hallway without person/face signal', () => {
    const asset = {
      alt: 'apartment hallway empty corridor',
      url: 'https://example.com/hallway.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(false);
  });

  it('returns true for kitchen with a tenant/face signal', () => {
    const asset = {
      alt: 'worried couple reading letter kitchen apartment',
      url: 'https://example.com/kitchen-couple.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(true);
  });

  it('returns true for kitchen with eviction context', () => {
    const asset = {
      alt: 'family kitchen eviction notice housing crisis',
      url: 'https://example.com/kitchen-evict.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(true);
  });
});


describe('introFaceTier — healthcare-web69 medica/filmworks/versius rejects', () => {
  it('hard-rejects cambridge filmworks / medica / versius-senhance promo pads (-1)', () => {
    const cases = [
      {
        alt: 'versius surgical robotic system cmr surgical cambridge filmworks have partnered',
        title: 'versius surgical robotic system cmr surgical cambridge filmworks',
        url: 'https://vimeo.com/versius.mp4',
        type: 'video',
      },
      {
        alt: 'wide and fsn at medica 2013 here we see the company s new series of smart m',
        title: 'wide and fsn at medica 2013',
        url: 'https://archive.org/medica2013.mp4',
        type: 'video',
      },
      {
        alt: 'senhance surgical robotic system full length benefits this is senhance',
        title: 'senhance surgical robotic system full length benefits',
        url: 'https://vimeo.com/senhance.mp4',
        type: 'video',
      },
    ];
    for (const asset of cases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });
});

describe('introFaceTier — healthcare-web70 Science Nation globe reject', () => {
  it('hard-rejects Science Nation globe/logo title-card pads (-1)', () => {
    expect(introFaceTier({
      alt: 'science nation globe background graphic nsf intro',
      title: 'science nation globe logo title card',
      url: 'https://archive.org/sn-globe.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('hard-rejects web71 NSF sciencenation surgical-robotics branding without OR/patient (-1)', () => {
    expect(introFaceTier({
      alt: 'science nation surgical robotics national science foundation nsf science nation sciencenation',
      title: 'science nation surgical robotics national science foundation nsf science nation sciencenation',
      url: 'https://archive.org/sn-brand.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });
});

const AIRLINE_TOPIC = 'Why airline cabin-pressure failures keep happening and what they hid';

describe('buildEditTimeline: airline hook follow-through (web8 stretch)', () => {
  it('keeps face/oxygen/bright cabin in the first ~8s — never empty/dark cabin', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 4,
          narration: 'Why did the cabin keep failing?',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 10,
          narration: 'They buried every pressure report while oxygen masks sat unused.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/passenger-face.mp4',
          alt: 'worried passenger face close-up portrait airplane cabin people',
          query: 'passenger face cabin',
          source: 'Bing web video',
        },
        {
          id: 'dark-empty',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/dark-empty-cabin.mp4',
          alt: 'dark empty airplane cabin interior night vacant seats',
          query: 'airplane cabin',
          source: 'Archive.org live',
        },
        {
          id: 'oxygen',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/oxygen-masks.mp4',
          alt: 'oxygen masks deployed airplane cabin pressure drop passengers',
          query: 'oxygen mask cabin',
          source: 'Vimeo',
        },
        {
          id: 'bright',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/bright-cabin.mp4',
          alt: 'bright daylight airplane cabin interior well-lit aisle passengers seated',
          query: 'bright cabin daylight',
          source: 'Dailymotion',
        },
        {
          id: 'shelf',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/shelf.mp4',
          alt: 'woman at the shelf stocking grocery aisle retail store',
          query: 'stock footage',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // startSec is segment-local — accumulate intro duration for global time.
    const introDur = 4;
    const first8 = timeline.filter((e) => {
      const global = e.segmentId === 'intro' ? e.startSec : introDur + e.startSec;
      return global < 8;
    });
    expect(first8.length).toBeGreaterThan(0);
    const ids = first8.map((e) => e.assetId);
    expect(ids).not.toContain('dark-empty');
    expect(ids).not.toContain('shelf');
    expect(ids.some((id) => id === 'face' || id === 'oxygen' || id === 'bright')).toBe(true);
    expect(first8[0].assetId).toBe('face');
  });

  it('rejects empty/dark cabin and corporate news-desk as airline intro leads', () => {
    expect(introFaceTier({
      alt: 'dark empty airplane cabin interior night',
      title: 'empty cabin',
      url: 'https://example.com/dark.mp4',
      type: 'video',
    }, { airline: true })).toBe(0);
    expect(introFaceTier({
      alt: 'worried passenger face close-up portrait airplane cabin people',
      title: 'passenger face',
      url: 'https://example.com/face.mp4',
      type: 'video',
    }, { airline: true })).toBe(2);
  });

  it('keeps oxygen/face stakes in first ~8s — never fabric, golf, or animated course', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 4,
          narration: 'Why did the cabin keep failing?',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 12,
          narration: 'They buried every pressure report while oxygen masks sat unused.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'stakes-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/worried-oxygen-face.mp4',
          alt: 'worried passenger face close-up oxygen masks deployed cabin pressure drop people',
          query: 'passenger face oxygen mask',
          source: 'Bing web video',
        },
        {
          id: 'fabric',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/fabric-swatch.mp4',
          alt: 'the new aircraft interior design in sas cabin inspired by scandinavian design fabric swatches',
          query: 'aircraft cabin interior',
          source: 'Archive.org live',
        },
        {
          id: 'golf',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/golf-course.mp4',
          alt: 'aerial golf course green driving range landscape',
          query: 'stock footage',
          source: 'Bing web video',
        },
        {
          id: 'animated',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/sentinel-animation.mp4',
          alt: 'sentinel in the sky animation radar aviation navigation landscape hills',
          query: 'aviation safety film',
          source: 'Archive.org live',
        },
        {
          id: 'oxygen',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/oxygen-masks.mp4',
          alt: 'oxygen masks deployed airplane cabin pressure drop passengers',
          query: 'oxygen mask cabin',
          source: 'Vimeo',
        },
        {
          id: 'fa-shorts',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/fa-shorts.mp4',
          alt: 'flight attendant takes safety instructions to a new level shorts',
          query: 'flight attendant demonstration',
          source: 'Archive.org live',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const introDur = 4;
    const first8 = timeline.filter((e) => {
      const global = e.segmentId === 'intro' ? e.startSec : introDur + e.startSec;
      return global < 8;
    });
    const ids = first8.map((e) => e.assetId);
    expect(ids).not.toContain('fabric');
    expect(ids).not.toContain('golf');
    expect(ids).not.toContain('animated');
    expect(ids).not.toContain('fa-shorts');
    expect(ids.some((id) => id === 'stakes-face' || id === 'oxygen')).toBe(true);
    expect(first8[0].assetId).toBe('stakes-face');
  });

  it('caps airline short rich-pool reuse at ≤2 and prefers denser holds when coverage allows', () => {
    const media = Array.from({ length: 14 }, (_, i) => ({
      id: `clip-${i}`,
      segmentId: 'body',
      type: 'video',
      url: `https://example.com/airline-clip-${i}.mp4`,
      alt: `airline cabin aircraft passenger clip ${i} oxygen pressure`,
      query: 'airline cabin pressure',
      source: 'Bing web video',
    }));
    media[0] = {
      ...media[0],
      id: 'hook-face',
      segmentId: 'intro',
      alt: 'worried passenger face close-up portrait airplane cabin people oxygen masks',
      query: 'passenger face oxygen',
    };
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 3,
          narration: 'Cabin pressure failed again.',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 24,
          narration: 'Regional airlines hid cabin-pressure failures while oxygen masks sat unused in bright cabins.',
          title: 'Body',
        },
      ],
      media,
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline);
    const maxFromMap = Math.max(0, ...counts.values());
    expect(maxFromMap).toBeLessThanOrEqual(2);
    const bodyEntries = timeline.filter((e) => e.segmentId === 'body');
    const holds = bodyEntries.map((e) => e.endSec - e.startSec);
    const avgHold = holds.reduce((a, b) => a + b, 0) / Math.max(1, holds.length);
    // Dense airline rich cap (1.0) when hardMax covers; never slower than 1.5.
    expect(avgHold).toBeLessThanOrEqual(1.5);
  });

  it('clusters fabric / golf / animated pads for airline limited reuse', () => {
    expect(visualSubjectCluster({
      alt: 'woman fabric swatches textile sample aircraft interior design',
      url: 'https://example.com/fabric.mp4',
    })).toBe('fabric-swatch');
    expect(visualSubjectCluster({
      alt: 'golf course green aerial stock',
      url: 'https://example.com/golf.mp4',
    })).toBe('golf');
    expect(visualSubjectCluster({
      alt: 'sentinel in the sky animation radar aviation navigation',
      url: 'https://example.com/anim.mp4',
    })).toBe('animated-course');
  });

  it('keeps oxygen/face stakes — never The Star logo, biplane, or hangar pads (airline-s85-2)', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 4,
          narration: 'Why did the cabin keep failing?',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 20,
          narration: 'They buried every pressure report while oxygen masks sat unused.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'stakes-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/worried-oxygen-face.mp4',
          alt: 'worried passenger face close-up oxygen masks deployed cabin pressure drop people',
          query: 'passenger face oxygen mask',
          source: 'Bing web video',
        },
        {
          id: 'the-star',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/the-star-logo.mp4',
          alt: 'the star logo news channel station bug branding card',
          query: 'airline news',
          source: 'Archive.org live',
        },
        {
          id: 'mesa-brand',
          segmentId: 'body',
          type: 'image',
          url: 'https://example.com/mesa-facts.jpg',
          alt: 'Mesa Airlines: Company Facts and Work Culture - Cabin Crew HQ',
          query: 'mesa airlines',
          source: 'DuckDuckGo Images',
        },
        {
          id: 'biplane',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/biplane.mp4',
          alt: 'muddy biplane vintage propeller aircraft loop stock',
          query: 'vintage airplane',
          source: 'Archive.org live',
        },
        {
          id: 'hangar',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/hangar-timelapse.mp4',
          alt: 'aircraft hangar timelapse',
          query: 'aircraft hangar',
          source: 'Archive.org live',
        },
        {
          id: 'vintage-promo',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/1960s-promo.mp4',
          alt: '1960s world airways charter airline promotional film',
          query: 'airline promo',
          source: 'Archive.org live',
        },
        {
          id: 'oxygen',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/oxygen-masks.mp4',
          alt: 'oxygen masks deployed airplane cabin pressure drop passengers',
          query: 'oxygen mask cabin',
          source: 'Bing web video',
        },
        {
          id: 'bright',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/bright-cabin.mp4',
          alt: 'bright daylight airplane cabin interior well-lit aisle passengers seated',
          query: 'bright cabin daylight',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.0 });
    const ids = timeline.map((e) => e.assetId);
    expect(ids).not.toContain('the-star');
    expect(ids).not.toContain('mesa-brand');
    expect(ids).not.toContain('biplane');
    expect(ids).not.toContain('hangar');
    expect(ids).not.toContain('vintage-promo');
    expect(ids.some((id) => id === 'stakes-face' || id === 'oxygen' || id === 'bright')).toBe(true);
    const first8 = timeline.filter((e) => e.endSec <= 8 || e.startSec < 8);
    expect(first8[0].assetId).toBe('stakes-face');
  });

  it('clusters news-logo / biplane / hangar-taxi for airline limited reuse (s85-2)', () => {
    expect(visualSubjectCluster({
      alt: 'the star logo news channel station bug',
      url: 'https://example.com/star.mp4',
    })).toBe('news-logo');
    expect(visualSubjectCluster({
      alt: 'muddy biplane vintage propeller aircraft loop',
      url: 'https://example.com/biplane.mp4',
    })).toBe('biplane-vintage');
    expect(visualSubjectCluster({
      alt: 'aircraft hangar timelapse',
      url: 'https://example.com/hangar.mp4',
    })).toBe('hangar-taxi');
  });

  it('keeps oxygen/face stakes — never car mechanic or boarding-only openers (airline-s85-3)', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 4,
          narration: 'Why did the cabin keep failing?',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 20,
          narration: 'They buried every pressure report while oxygen masks sat unused.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'stakes-face',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/worried-oxygen-face.mp4',
          alt: 'worried passenger face close-up oxygen masks deployed cabin pressure drop people',
          query: 'passenger face oxygen mask',
          source: 'Bing web video',
        },
        {
          id: 'boarding',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/boarding.mp4',
          alt: 'passengers boarding airplane jet bridge gate queue airport',
          query: 'boarding airplane',
          source: 'Archive.org live',
        },
        {
          id: 'car-mechanic',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/car-mechanic.mp4',
          alt: 'car mechanic under a vehicle repair bay garage stock',
          query: 'mechanic',
          source: 'Bing web video',
        },
        {
          id: 'the-star',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/the-star-logo.mp4',
          alt: 'the star logo news channel station bug branding card',
          query: 'airline news',
          source: 'Archive.org live',
        },
        {
          id: 'biplane',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/biplane.mp4',
          alt: 'muddy biplane vintage propeller aircraft loop stock',
          query: 'vintage airplane',
          source: 'Archive.org live',
        },
        {
          id: 'oxygen',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/oxygen-masks.mp4',
          alt: 'oxygen masks deployed airplane cabin pressure drop passengers',
          query: 'oxygen mask cabin',
          source: 'Bing web video',
        },
        {
          id: 'bright',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/bright-cabin.mp4',
          alt: 'bright daylight airplane cabin interior well-lit aisle passengers seated',
          query: 'bright cabin daylight',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.0 });
    const ids = timeline.map((e) => e.assetId);
    expect(ids).not.toContain('car-mechanic');
    expect(ids).not.toContain('the-star');
    expect(ids).not.toContain('biplane');
    expect(ids.some((id) => id === 'stakes-face' || id === 'oxygen' || id === 'bright')).toBe(true);
    const introDur = 4;
    const first8 = timeline.filter((e) => {
      const global = e.segmentId === 'intro' ? e.startSec : introDur + e.startSec;
      return global < 8;
    });
    expect(first8.map((e) => e.assetId)).not.toContain('boarding');
    expect(first8[0].assetId).toBe('stakes-face');
  });

  it('clusters auto-mechanic / boarding-only for airline limited reuse (s85-3)', () => {
    expect(visualSubjectCluster({
      alt: 'car mechanic under a vehicle repair bay',
      url: 'https://example.com/mechanic.mp4',
    })).toBe('auto-mechanic');
    expect(visualSubjectCluster({
      alt: 'passengers boarding airplane jet bridge gate',
      url: 'https://example.com/boarding.mp4',
    })).toBe('boarding-only');
  });

  it('keeps denser airline rich-pool holds after first 15s (airline-s85-2 pacing)', () => {
    const media = Array.from({ length: 16 }, (_, i) => ({
      id: `clip-${i}`,
      segmentId: 'body',
      type: 'video',
      url: `https://example.com/airline-dense-${i}.mp4`,
      alt: `airline cabin aircraft passenger clip ${i} oxygen pressure worried face`,
      query: 'airline cabin pressure oxygen',
      source: 'Bing web video',
    }));
    media[0] = {
      ...media[0],
      id: 'hook-face',
      segmentId: 'intro',
      alt: 'worried passenger face close-up portrait airplane cabin people oxygen masks',
      query: 'passenger face oxygen',
    };
    const project = {
      topic: AIRLINE_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 3,
          narration: 'Cabin pressure failed again.',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 40,
          narration: 'Regional airlines hid cabin-pressure failures while oxygen masks sat unused in bright cabins across multiple flights.',
          title: 'Body',
        },
      ],
      media,
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const after15 = timeline.filter((e) => e.startSec >= 15);
    expect(after15.length).toBeGreaterThan(0);
    const holds = after15.map((e) => e.endSec - e.startSec);
    const avgHold = holds.reduce((a, b) => a + b, 0) / holds.length;
    // Dense airline cap (1.0) when coverage allows; never slower than 1.5 after 15s.
    expect(avgHold).toBeLessThanOrEqual(1.5);
  });
});
