# Bugfix Requirements Document

## Introduction

The AutoTube AI video generation pipeline produces videos that fail to meet a comprehensive 225-item quality checklist covering thumbnails/packaging, hooks, script-to-visual alignment, pacing/assembly, graphics/motion design, story structure, credibility/accuracy, audience fit, retention engineering, audio/voice, scene selection, section design templates, titles/framing, AI tool rules, and highest-priority changes. The pipeline currently generates generic output without validating quality across these dimensions, resulting in low click-through rates, poor retention, and videos that don't compete with top-performing YouTube content.

## Bug Analysis

### Current Behavior (Defect)

**Thumbnail and Packaging**

1.1 WHEN the pipeline generates a thumbnail THEN the system does not instantly communicate the specific topic (e.g., cybercrime), producing only generic mood imagery

1.2 WHEN the pipeline generates a thumbnail THEN the system does not use a clear visual threat (hacked laptop, frozen bank screen, phishing email, ransom note, or distressed business owner)

1.3 WHEN the pipeline generates a thumbnail THEN the system uses generic dark city or crowd imagery even when it does not directly support the topic

1.4 WHEN the pipeline generates a thumbnail THEN the system allows multiple competing focal points instead of one dominant subject

1.5 WHEN the pipeline generates a thumbnail THEN the system adds digital overlays that do not improve comprehension in under one second

1.6 WHEN the pipeline generates thumbnail text THEN the system does not ensure readability on mobile at very small size

1.7 WHEN the pipeline generates thumbnail text THEN the system does not limit text to 2-5 words

1.8 WHEN the pipeline generates a thumbnail THEN the system does not use emotional contrast (calm victim vs digital danger)

1.9 WHEN the pipeline generates a thumbnail THEN the system does not make human stakes visible, showing only global stakes

1.10 WHEN the pipeline generates a thumbnail THEN the system does not ensure title and thumbnail promise the same story

1.11 WHEN the pipeline generates a thumbnail THEN the system does not test a "you are at risk" variant versus a "world cyber war" variant

1.12 WHEN the pipeline generates a thumbnail THEN the system does not prefer face, object, or screen close-ups over distant wide shots

1.13 WHEN the pipeline generates a thumbnail THEN the system does not use one accent color for urgency while keeping the rest restrained

1.14 WHEN the pipeline generates a thumbnail THEN the system does not enforce a clear central visual hierarchy (subject first, text second, branding third)

1.15 WHEN the pipeline generates a thumbnail THEN the system allows channel branding to become the main focal point

1.16 WHEN the pipeline generates a thumbnail THEN the system produces cluttered compositions with too many secondary elements

1.17 WHEN the pipeline generates a thumbnail THEN the system produces thumbnails that are not legible without context from the title

1.18 WHEN the pipeline generates a thumbnail THEN the system does not use bold contrast between foreground and background

1.19 WHEN the pipeline generates a thumbnail THEN the system does not include a topic-specific signifier in thumbnail variants

1.20 WHEN the pipeline generates a thumbnail THEN the system produces only 1 concept instead of at least 3 concepts per video

1.21 WHEN the pipeline generates thumbnail variants THEN the system does not include one "fear" version, one "curiosity" version, and one "authority/news" version

1.22 WHEN the pipeline generates a thumbnail THEN the system does not account for small business owners responding better to direct consequences than abstract geopolitics

1.23 WHEN the pipeline generates thumbnail text THEN the system uses vague phrasing without payoff

1.24 WHEN the pipeline generates thumbnail text THEN the system does not test stronger wording variants ("Your Business Could Be Next," "Hackers Want This," "One Click Can Ruin You")

1.25 WHEN the pipeline generates a thumbnail THEN the system does not match color grading between thumbnail and video intro for continuity

**Hook and First 15 Seconds**

1.26 WHEN the pipeline generates the video opening THEN the system does not show danger in the first second, showing setup instead

1.27 WHEN the pipeline generates the hook THEN the system does not start with concrete risks (money, files, identity, business shutdown)

1.28 WHEN the pipeline generates the hook THEN the system opens with too many abstract phrases in a row

1.29 WHEN the pipeline generates the hook THEN the system does not use 3-5 fast visual beats before the first full explanatory sentence

1.30 WHEN the pipeline generates the hook THEN the system does not show a hacked screen, alert, frozen system, or fake email immediately

1.31 WHEN the pipeline generates the hook THEN the system produces a first line that is not understandable by someone half-paying attention

1.32 WHEN the pipeline generates the hook THEN the system does not ensure visuals answer "why should I care" instantly

1.33 WHEN the pipeline generates the hook THEN the system does not add motion, zoom, or impact sound at the first risk statement

1.34 WHEN the pipeline generates the hook THEN the system does not use on-screen text in the intro to reinforce the spoken hook

1.35 WHEN the pipeline generates the hook THEN the system does not keep first sentences short, sharp, and personal

1.36 WHEN the pipeline generates the hook THEN the system does not frame the threat as immediate and familiar before scaling to global issues

1.37 WHEN the pipeline generates the hook THEN the system does not build curiosity with a reveal, only alarm

1.38 WHEN the pipeline generates the hook THEN the system produces an opening that feels like a school explainer

1.39 WHEN the pipeline generates the hook THEN the system does not ensure the intro works with audio low or muted

1.40 WHEN the pipeline generates the hook THEN the system does not ensure the viewer knows topic, stakes, and angle within 15 seconds

1.41 WHEN the pipeline generates the hook THEN the system does not limit visual metaphors to only those instantly understandable

1.42 WHEN the pipeline generates the hook THEN the system does not source or carefully frame statistics used in the opener

1.43 WHEN the pipeline generates the hook THEN the system does not put the strongest shot in the first 5 seconds

1.44 WHEN the pipeline generates the hook THEN the system uses a clean title card before emotional and practical stakes are established

1.45 WHEN the pipeline generates hook variants THEN the system does not rank them by clarity, intensity, and retention potential

**Script-to-Visual Alignment**

1.46 WHEN the pipeline selects visuals THEN the system does not ensure every sentence has a visual purpose

1.47 WHEN the pipeline selects visuals THEN the system allows narration to explain something the image does not support

1.48 WHEN the pipeline selects visuals THEN the system does not provide concrete visual translation for abstract script lines

1.49 WHEN the script says "your bank account" THEN the system does not show money or banking visuals

1.50 WHEN the script says "your identity" THEN the system does not show ID theft, login takeover, or stolen credentials

1.51 WHEN the script says "power grid" THEN the system shows generic hackers instead of infrastructure

1.52 WHEN the pipeline selects visuals THEN the system does not match visual scale to script scale (personal lines get personal visuals; geopolitical lines get larger-context visuals)

1.53 WHEN the pipeline selects visuals THEN the system reuses the same stock image for unrelated concepts

1.54 WHEN the pipeline selects visuals THEN the system does not ensure the emotional tone of footage matches the script

1.55 WHEN the story shifts THEN the system does not shift the visual language accordingly

1.56 WHEN the pipeline handles a personal story section THEN the system does not use a more intimate, grounded visual set than the state-actor section

1.57 WHEN the pipeline handles different story sections THEN the system does not make them feel structurally different from each other

1.58 WHEN the video says "what it means for you" THEN the system does not keep returning to the individual viewer visually

1.59 WHEN the pipeline selects visuals THEN the system does not reject visuals that are technically relevant but emotionally weak

1.60 WHEN the pipeline selects visuals THEN the system scores image-to-line fit by keyword match only, not emotional/contextual alignment

**Pacing and Assembly**

1.61 WHEN the pipeline assembles segments THEN the system cuts on time intervals instead of meaning shifts

1.62 WHEN the pipeline assembles segments THEN the system does not use faster cuts in the opener than in the explanation section

1.63 WHEN the pipeline assembles segments THEN the system allows long runs of the same shot type

1.64 WHEN the pipeline assembles segments THEN the system does not vary close-up, medium, interface, map, and typography shots

1.65 WHEN the pipeline assembles segments THEN the system does not add pattern interrupts every 20-30 seconds

1.66 WHEN the pipeline assembles segments THEN the system does not use pattern interrupts (text slam, sudden silence, zoom, graphic switch, or rhetorical question)

1.67 WHEN the pipeline assembles segments THEN the system does not cut away from generic talking-head energy when visuals weaken urgency

1.68 WHEN the pipeline assembles under-five-minute videos THEN the system allows dead air

1.69 WHEN the pipeline assembles segments THEN the system does not ensure every segment either escalates, clarifies, or rewards the viewer

1.70 WHEN the pipeline assembles segments THEN the system does not trim duplicated lines and repeated stakes

1.71 WHEN the pipeline uses repetition THEN the system does not ensure visuals evolve with it

1.72 WHEN the pipeline assembles segments THEN the system does not build pacing in waves (impact, explanation, escalation, relief, impact)

1.73 WHEN the pipeline assembles segments THEN the system does not save one high-impact visual sequence for the midpoint to prevent drop-off

1.74 WHEN the pipeline assembles segments THEN the system does not end each section with a reason to continue

1.75 WHEN the pipeline assembles segments THEN the system does not analyze monotony risk in sequential clips

1.76 WHEN the script becomes conceptual THEN the system does not use shorter visual units

1.77 WHEN the pipeline uses slower visuals THEN the system does not ensure they create emotional weight

1.78 WHEN the pipeline assembles segments THEN the system makes every scene feel equally intense without contrast

1.79 WHEN the pipeline handles lists or risk cascades THEN the system does not use faster graphic rhythm

1.80 WHEN the pipeline assembles the first half THEN the system does not prioritize retention over completeness

**Graphics and Motion Design**

1.81 WHEN the pipeline generates motion graphics THEN the system uses them to decorate rather than explain

1.82 WHEN the pipeline generates overlays THEN the system does not ensure every lower-third, overlay, or title carries a specific job

1.83 WHEN the pipeline generates on-screen text THEN the system does not use large, readable text for key points

1.84 WHEN the pipeline generates on-screen text THEN the system does not keep text phrases short enough to process instantly

1.85 WHEN the pipeline generates graphics THEN the system uses overdesigned cyber aesthetics that hurt legibility

1.86 WHEN the pipeline generates graphics THEN the system overuses glitch effects making them look cheap and dated

1.87 WHEN the pipeline generates interface mockups THEN the system does not make them resemble real software enough to feel believable

1.88 WHEN the pipeline generates icons THEN the system uses them to replace explanation rather than reinforce meaning

1.89 WHEN the pipeline generates graphics THEN the system does not use one consistent type system across the video package

1.90 WHEN the pipeline generates graphics THEN the system does not use a color system that separates danger, information, and solutions clearly

1.91 WHEN the pipeline generates graphics THEN the system does not use red for threat, blue/neutral for explanation, and green for action/safety

1.92 WHEN the pipeline generates animated text THEN the system applies emphasis on every phrase instead of key nouns only

1.93 WHEN the pipeline generates subtitles and kinetic text THEN the system allows them to compete with each other

1.94 WHEN the pipeline generates map graphics THEN the system produces overloaded maps instead of simple high-contrast ones

1.95 WHEN the pipeline generates graphics THEN the system does not detect when footage needs supportive overlays to become understandable

1.96 WHEN the pipeline generates graphics THEN the system does not use alert banners, pop-ups, and notification motifs to create urgency

1.97 WHEN the pipeline generates graphics THEN the system does not build recurring graphic motifs across episodes for brand recognition

1.98 WHEN the pipeline generates graphics THEN the system does not use different motion styles for different story layers (personal, corporate, geopolitical, practical)

1.99 WHEN the pipeline generates typography THEN the system uses gamer or sci-fi styles instead of modern and authoritative

1.100 WHEN the pipeline generates graphics THEN the system does not score visual readability on mobile before approving a sequence

**Story Structure**

1.101 WHEN the pipeline structures the story THEN the system does not open with immediate personal stakes

1.102 WHEN the pipeline structures the story THEN the system does not move from individual threat to larger system threat

1.103 WHEN the pipeline structures the story THEN the system does not bring the viewer back to themselves regularly

1.104 WHEN the pipeline structures the story THEN the system does not use the personal story section as the emotional anchor with concrete details

1.105 WHEN the pipeline structures the story THEN the system does not place the most relatable example early, before geopolitics

1.106 WHEN the pipeline structures the story THEN the system does not transition into nation-state material with a clear bridge

1.107 WHEN the pipeline structures the story THEN the system jumps from personal story to military cyber units without setup

1.108 WHEN the pipeline structures the story THEN the system does not use "this affects you because…" bridges when the story scales up

1.109 WHEN the pipeline structures the story THEN the system does not ensure each section answers one question before opening the next

1.110 WHEN the pipeline structures the story THEN the system does not limit the number of big ideas introduced per minute

1.111 WHEN the pipeline structures the story THEN the system requires specialist knowledge to follow the logic

1.112 WHEN the pipeline structures the story THEN the system does not make the practical advice section feel earned and useful

1.113 WHEN the pipeline structures the story THEN the system does not ensure the ending releases tension by giving agency

1.114 WHEN the pipeline structures the story THEN the system ends on pure fear without action

1.115 WHEN the pipeline structures the story THEN the system does not make the next-video teaser feel like an irresistible continuation

**Credibility and Accuracy**

1.116 WHEN the pipeline generates scripts with statistics THEN the system does not flag unsourced statistics for review

1.117 WHEN the pipeline generates scripts with large figures THEN the system does not check and normalize figures before final output

1.118 WHEN the pipeline generates scripts with major claims THEN the system does not use "according to" language

1.119 WHEN the pipeline references organizations THEN the system uses vague phrasing instead of precise attribution

1.120 WHEN the pipeline generates state-actor attributions THEN the system overstates them without careful presentation

1.121 WHEN the pipeline generates scripts THEN the system does not distinguish between verified claims, interpretive framing, and opinion

1.122 WHEN the pipeline generates scripts THEN the system allows emotional intensity to come at the expense of trust

1.123 WHEN the pipeline generates scripts THEN the system does not optimize for viewers feeling informed rather than manipulated

1.124 WHEN the pipeline generates scripts THEN the system does not offer a "high drama" mode and a "high credibility" mode

1.125 WHEN the pipeline generates scripts THEN the system does not use strong authority framing for business-oriented audiences

**Audience Fit**

1.126 WHEN the pipeline generates content THEN the system does not use simple language and familiar visual examples for non-technical adults

1.127 WHEN the pipeline generates content THEN the system does not address what small business owners care most about (downtime, money loss, customer trust, operational paralysis)

1.128 WHEN the pipeline generates content THEN the system does not show consequences they recognize immediately (locked files, fake invoices, frozen POS systems, stolen logins)

1.129 WHEN the pipeline generates content THEN the system overloads viewers with intelligence-agency detail too early

1.130 WHEN the pipeline discusses geopolitics THEN the system does not connect it back to supply chains, utilities, communications, or business systems

1.131 WHEN the pipeline generates content for freelancers THEN the system does not address identity theft, account lockout, invoice fraud, and lost client data

1.132 WHEN the pipeline generates protection steps THEN the system does not make them look realistic and manageable

1.133 WHEN the pipeline generates content THEN the system does not make viewers feel concerned but not helpless

1.134 WHEN the pipeline generates content THEN the system uses fear without a survival path, reducing shareability and satisfaction

1.135 WHEN the pipeline generates content THEN the system does not generate audience-specific variants for consumers, freelancers, and small business owners

**Retention Engineering**

1.136 WHEN the pipeline generates scripts THEN the system does not add curiosity loops at natural drop-off points

1.137 WHEN the pipeline generates scripts THEN the system does not ask questions the next section answers quickly

1.138 WHEN the pipeline generates scripts THEN the system does not use mini cliffhangers before transitions

1.139 WHEN the pipeline generates scripts THEN the system does not build at least one "this could happen to you in one click" moment

1.140 WHEN the pipeline generates scripts THEN the system does not alternate fear with clarity to prevent viewer fatigue

1.141 WHEN the pipeline generates scripts THEN the system does not use practical payoff after heavy warning sequences

1.142 WHEN the pipeline generates scripts THEN the system does not ensure the midpoint intensifies the story or reveals a bigger implication

1.143 WHEN the pipeline generates scripts THEN the system does not remove lines that sound good but do not improve retention or understanding

1.144 WHEN the pipeline generates scripts THEN the system does not ensure every second has purpose to create density

1.145 WHEN the pipeline generates scripts THEN the system does not score each line for necessity, only grammatical quality

1.146 WHEN the pipeline generates scripts THEN the system does not build comment triggers into the ending

1.147 WHEN the pipeline generates scripts THEN the system does not use emotional specificity for retention

1.148 WHEN the pipeline generates scripts THEN the system does not use concrete examples as retention anchors people remember later

1.149 WHEN the pipeline generates scripts THEN the system does not create momentum toward the final warning and solution

1.150 WHEN the pipeline generates scripts THEN the system does not ensure the last 20 seconds reward viewers for staying

**Audio and Voice**

1.151 WHEN the pipeline generates audio direction THEN the system does not use impact sounds to punctuate critical reveals

1.152 WHEN the pipeline generates audio direction THEN the system overfills the mix with constant dramatic music

1.153 WHEN the pipeline generates audio direction THEN the system does not leave brief sonic space before major statements

1.154 WHEN the pipeline generates audio direction THEN the system does not sync visual hit points with voice emphasis

1.155 WHEN the pipeline generates audio direction THEN the system uses risers even when they do not support actual escalation

1.156 WHEN the pipeline generates audio direction THEN the system does not use a calmer sound bed for practical advice sections than fear sections

1.157 WHEN the pipeline generates audio direction THEN the system does not use audio to help define story sections when visuals shift

1.158 WHEN the pipeline generates audio direction THEN the system does not align SFX moments to retention-critical lines

1.159 WHEN the pipeline generates audio direction THEN the system makes the entire video one unbroken wall of tension

1.160 WHEN the pipeline generates audio direction THEN the system edits to the beat rather than to the thought

**Scene Selection Logic**

1.161 WHEN the pipeline selects scenes THEN the system does not prioritize clips with clear human emotion

1.162 WHEN the pipeline selects scenes THEN the system does not prioritize clips with obvious cause-and-effect

1.163 WHEN the pipeline selects scenes THEN the system does not prefer footage with strong silhouette and immediate readability

1.164 WHEN the pipeline selects scenes THEN the system does not reject clips that are technically on-topic but visually vague

1.165 WHEN the pipeline selects scenes THEN the system does not score footage for emotional clarity, only semantic relevance

1.166 WHEN the pipeline selects scenes THEN the system does not actively diversify repetitive footage

1.167 WHEN the pipeline selects scenes THEN the system overuses code-on-screen as filler

1.168 WHEN the pipeline selects scenes THEN the system does not use screens, hands, faces, offices, shops, and infrastructure to ground the topic

1.169 WHEN the pipeline selects scenes THEN the system does not match footage energy to narration energy

1.170 WHEN the pipeline selects scenes THEN the system does not use more grounded footage in the first half and conceptual footage only after trust is built

1.171 WHEN the pipeline selects scenes THEN the system does not detect stock-footage fatigue risk

1.172 WHEN the pipeline selects scenes THEN the system does not prefer human-centered visuals over abstract tech backgrounds for mass audiences

1.173 WHEN the pipeline selects scenes THEN the system uses visuals of "hackers typing" instead of consequences

1.174 WHEN the pipeline selects scenes THEN the system does not add a fresh shot every 15-20 seconds relative to the previous run

1.175 WHEN the pipeline selects scenes THEN the system does not maintain a sequence-level diversity score

**Section Design Templates**

1.176 WHEN the pipeline designs personal-risk sections THEN the system does not use close shots, screens, alerts, intimate spaces, and readable UI

1.177 WHEN the pipeline designs corporate-risk sections THEN the system does not show offices, servers, dashboards, shutdown effects, and team reactions

1.178 WHEN the pipeline designs geopolitical-risk sections THEN the system does not use maps, infrastructure, communications, and simple strategic overlays

1.179 WHEN the pipeline designs advice sections THEN the system does not use clean checklists, calmer pacing, and reassuring color balance

1.180 WHEN the pipeline designs story-example sections THEN the system does not structure them with a mini beginning, disruption, and aftermath

1.181 WHEN the pipeline designs sections THEN the system does not assign a visual mode to each section, using one style for the entire video

1.182 WHEN the pipeline designs sections THEN the system does not use section cards or title slams to help orientation when the topic changes

1.183 WHEN the pipeline designs sections THEN the system does not use repeated motif transitions so the video feels branded instead of random

1.184 WHEN the pipeline designs the practical-tips section THEN the system does not make it feel like a reward state

1.185 WHEN the pipeline designs the final CTA section THEN the system does not connect emotionally and visually to the opening problem

**Titles and Framing**

1.186 WHEN the pipeline generates titles THEN the system uses vague labels instead of concrete outcomes

1.187 WHEN the pipeline generates verbal framing THEN the system uses generic phrases like "cyber threats are rising" instead of "this is how they get in"

1.188 WHEN the pipeline generates on-screen text THEN the system duplicates narration word-for-word instead of finishing the thought

1.189 WHEN the pipeline generates on-screen text THEN the system does not use headline-style text cards for major reveals

1.190 WHEN the pipeline generates on-screen text THEN the system shows too many long sentence subtitles on screen at once

1.191 WHEN the pipeline names complex entities THEN the system does not simplify visually for general viewers

1.192 WHEN the pipeline generates verbal framing THEN the system does not use audience-facing language ("your files," "your payroll," "your customer data," "your invoices")

1.193 WHEN the pipeline generates packaging THEN the system uses broad abstractions instead of simple nouns and verbs

1.194 WHEN the pipeline generates titles THEN the system does not generate 10-20 title variants ranked by specificity and curiosity

1.195 WHEN the pipeline generates titles THEN the system does not use stronger title families (loss, exposure, sabotage, shutdown, lockout, one-click disaster)

**AI Tool Rules**

1.196 WHEN the pipeline generates output THEN the system does not optimize for click-through and retention together

1.197 WHEN the pipeline generates output THEN the system does not score every video on clarity, urgency, emotional specificity, and credibility

1.198 WHEN the pipeline generates output THEN the system does not produce multiple hooks, thumbnails, and scene assemblies automatically

1.199 WHEN the pipeline generates output THEN the system does not flag when a section becomes too abstract for the intended audience

1.200 WHEN the pipeline generates output THEN the system does not identify repeated visual motifs and suggest replacements

1.201 WHEN the pipeline generates output THEN the system does not classify each script line as personal, institutional, geopolitical, or practical for visual selection

1.202 WHEN the pipeline generates output THEN the system does not maintain a consistent brand kit (fonts, colors, transitions, lower-thirds, thumbnail logic)

1.203 WHEN the pipeline generates output THEN the system does not check mobile readability for thumbnails, text overlays, and UI inserts

1.204 WHEN the pipeline generates output THEN the system does not detect unsupported claims or outdated statistics before render

1.205 WHEN the pipeline generates output THEN the system does not build a visible "problem to solution" arc into every script

1.206 WHEN the pipeline generates output THEN the system does not privilege concrete consequence footage over generic hacker imagery

1.207 WHEN the pipeline generates output THEN the system does not learn which hooks perform best per audience profile

1.208 WHEN the pipeline generates output THEN the system does not prefer human faces and immediate consequences in the opening package for broad audiences

1.209 WHEN the pipeline generates output THEN the system does not reserve abstract war framing for later escalation after trust is built

1.210 WHEN the pipeline generates output THEN the system does not generate assembly notes explaining why each clip was chosen

1.211 WHEN the pipeline generates output THEN the system does not generate at least one safer credible edit and one more aggressive viral edit per script

1.212 WHEN the pipeline generates output THEN the system does not test whether the video still works with sound low

1.213 WHEN the pipeline generates output THEN the system does not measure section-level retention risk from repetition, abstraction, and weak visual payoff

1.214 WHEN the pipeline generates output THEN the system does not output "must replace" warnings for weak thumbnails or generic openings

1.215 WHEN the pipeline generates output THEN the system does not turn improvements into modular templates for future videos

**Highest-Priority Changes**

1.216 WHEN the pipeline generates a video THEN the system does not automatically replace the thumbnail with a clearer topic-specific concept

1.217 WHEN the pipeline generates a video THEN the system does not rewrite the opening 15 seconds for personal stakes and immediate comprehension

1.218 WHEN the pipeline generates a video THEN the system does not make the first visuals concrete (money, business systems, identity, lockout)

1.219 WHEN the pipeline generates a video THEN the system does not strengthen personal story sequences with more grounded and specific visuals

1.220 WHEN the pipeline generates a video THEN the system does not add stronger visual transitions between personal, geopolitical, and practical sections

1.221 WHEN the pipeline generates a video THEN the system does not remove repeated wording and duplicated end-stakes lines

1.222 WHEN the pipeline generates a video THEN the system does not expand and improve the practical-advice payoff

1.223 WHEN the pipeline generates a video THEN the system does not add better source framing for big claims and statistics

1.224 WHEN the pipeline generates a video THEN the system does not make the ending feel empowering, not only alarming

1.225 WHEN the pipeline generates a video THEN the system does not build the pipeline around clarity first, then drama, then polish

### Expected Behavior (Correct)

**Thumbnail and Packaging**

2.1 WHEN the pipeline generates a thumbnail THEN the system SHALL instantly communicate the specific topic (e.g., cybercrime) through clear visual signifiers

2.2 WHEN the pipeline generates a thumbnail THEN the system SHALL use a clear visual threat (hacked laptop, frozen bank screen, phishing email, ransom note, or distressed business owner)

2.3 WHEN the pipeline generates a thumbnail THEN the system SHALL avoid generic dark city or crowd imagery unless it directly supports the topic

2.4 WHEN the pipeline generates a thumbnail THEN the system SHALL show one dominant subject without multiple competing focal points

2.5 WHEN the pipeline generates a thumbnail THEN the system SHALL add subtle digital overlays only if they improve comprehension in under one second

2.6 WHEN the pipeline generates thumbnail text THEN the system SHALL ensure readability on mobile at very small size (160×90px)

2.7 WHEN the pipeline generates thumbnail text THEN the system SHALL limit text to 2-5 words

2.8 WHEN the pipeline generates a thumbnail THEN the system SHALL use emotional contrast (calm victim vs digital danger)

2.9 WHEN the pipeline generates a thumbnail THEN the system SHALL make human stakes visible, not just global stakes

2.10 WHEN the pipeline generates a thumbnail THEN the system SHALL ensure title and thumbnail promise the same story

2.11 WHEN the pipeline generates thumbnail variants THEN the system SHALL test a "you are at risk" variant versus a "world cyber war" variant

2.12 WHEN the pipeline generates a thumbnail THEN the system SHALL prefer face, object, or screen close-ups over distant wide shots

2.13 WHEN the pipeline generates a thumbnail THEN the system SHALL use one accent color for urgency while keeping the rest restrained

2.14 WHEN the pipeline generates a thumbnail THEN the system SHALL enforce a clear central visual hierarchy (subject first, text second, branding third)

2.15 WHEN the pipeline generates a thumbnail THEN the system SHALL ensure channel branding is visible but never the main focal point

2.16 WHEN the pipeline generates a thumbnail THEN the system SHALL avoid cluttered compositions with too many secondary elements

2.17 WHEN the pipeline generates a thumbnail THEN the system SHALL make the thumbnail legible without context from the title

2.18 WHEN the pipeline generates a thumbnail THEN the system SHALL use bold contrast between foreground and background

2.19 WHEN the pipeline generates a thumbnail THEN the system SHALL include a topic-specific signifier in most thumbnail variants

2.20 WHEN the pipeline generates a thumbnail THEN the system SHALL generate at least 3 thumbnail concepts per video before choosing one

2.21 WHEN the pipeline generates thumbnail variants THEN the system SHALL include one "fear" version, one "curiosity" version, and one "authority/news" version

2.22 WHEN the pipeline generates a thumbnail THEN the system SHALL account for small business owners responding better to direct consequences than abstract geopolitics

2.23 WHEN the pipeline generates thumbnail text THEN the system SHALL avoid vague phrasing without payoff

2.24 WHEN the pipeline generates thumbnail text THEN the system SHALL test stronger wording variants ("Your Business Could Be Next," "Hackers Want This," "One Click Can Ruin You")

2.25 WHEN the pipeline generates a thumbnail THEN the system SHALL match color grading between thumbnail and video intro for continuity

**Hook and First 15 Seconds**

2.26 WHEN the pipeline generates the video opening THEN the system SHALL show danger in the first second, not setup

2.27 WHEN the pipeline generates the hook THEN the system SHALL start with concrete risks (money, files, identity, business shutdown)

2.28 WHEN the pipeline generates the hook THEN the system SHALL avoid opening with too many abstract phrases in a row

2.29 WHEN the pipeline generates the hook THEN the system SHALL use 3-5 fast visual beats before the first full explanatory sentence

2.30 WHEN the pipeline generates the hook THEN the system SHALL show a hacked screen, alert, frozen system, or fake email immediately

2.31 WHEN the pipeline generates the hook THEN the system SHALL ensure the first line is understandable by someone half-paying attention

2.32 WHEN the pipeline generates the hook THEN the system SHALL ensure visuals answer "why should I care" instantly

2.33 WHEN the pipeline generates the hook THEN the system SHALL add motion, zoom, or impact sound at the first risk statement

2.34 WHEN the pipeline generates the hook THEN the system SHALL use on-screen text in the intro to reinforce the spoken hook

2.35 WHEN the pipeline generates the hook THEN the system SHALL keep first sentences short, sharp, and personal

2.36 WHEN the pipeline generates the hook THEN the system SHALL frame the threat as immediate and familiar before scaling to global issues

2.37 WHEN the pipeline generates the hook THEN the system SHALL build curiosity with a reveal, not just alarm

2.38 WHEN the pipeline generates the hook THEN the system SHALL avoid feeling like a school explainer in the opening

2.39 WHEN the pipeline generates the hook THEN the system SHALL ensure the intro works even with audio low or muted

2.40 WHEN the pipeline generates the hook THEN the system SHALL ensure the viewer knows topic, stakes, and angle within 15 seconds

2.41 WHEN the pipeline generates the hook THEN the system SHALL use one visual metaphor only if it is instantly understandable

2.42 WHEN the pipeline generates the hook THEN the system SHALL source or carefully frame any statistic used in the opener

2.43 WHEN the pipeline generates the hook THEN the system SHALL put the strongest shot in the first 5 seconds

2.44 WHEN the pipeline generates the hook THEN the system SHALL use a clean title card only after emotional and practical stakes are established

2.45 WHEN the pipeline generates hook variants THEN the system SHALL rank them by clarity, intensity, and retention potential

**Script-to-Visual Alignment**

2.46 WHEN the pipeline selects visuals THEN the system SHALL ensure every sentence has a visual purpose

2.47 WHEN the pipeline selects visuals THEN the system SHALL not let narration explain something the image does not support

2.48 WHEN the pipeline selects visuals THEN the system SHALL provide concrete visual translation for abstract script lines

2.49 WHEN the script says "your bank account" THEN the system SHALL show money or banking visuals

2.50 WHEN the script says "your identity" THEN the system SHALL show ID theft, login takeover, or stolen credentials

2.51 WHEN the script says "power grid" THEN the system SHALL show infrastructure, not generic hackers

2.52 WHEN the pipeline selects visuals THEN the system SHALL match visual scale to script scale (personal lines get personal visuals; geopolitical lines get larger-context visuals)

2.53 WHEN the pipeline selects visuals THEN the system SHALL avoid using the same stock image for unrelated concepts

2.54 WHEN the pipeline selects visuals THEN the system SHALL ensure the emotional tone of footage matches the script

2.55 WHEN the story shifts THEN the system SHALL shift the visual language accordingly

2.56 WHEN the pipeline handles a personal story section THEN the system SHALL use a more intimate, grounded visual set than the state-actor section

2.57 WHEN the pipeline handles different story sections THEN the system SHALL make them feel structurally different from each other

2.58 WHEN the video says "what it means for you" THEN the system SHALL keep returning to the individual viewer visually

2.59 WHEN the pipeline selects visuals THEN the system SHALL reject visuals that are technically relevant but emotionally weak

2.60 WHEN the pipeline selects visuals THEN the system SHALL score image-to-line fit based on emotional/contextual alignment, not just keyword match

**Pacing and Assembly**

2.61 WHEN the pipeline assembles segments THEN the system SHALL cut on meaning shifts, not just time intervals

2.62 WHEN the pipeline assembles segments THEN the system SHALL use faster cuts in the opener than in the explanation section

2.63 WHEN the pipeline assembles segments THEN the system SHALL avoid long runs of the same shot type

2.64 WHEN the pipeline assembles segments THEN the system SHALL vary close-up, medium, interface, map, and typography shots

2.65 WHEN the pipeline assembles segments THEN the system SHALL add pattern interrupts every 20-30 seconds

2.66 WHEN the pipeline assembles segments THEN the system SHALL use pattern interrupts (text slam, sudden silence, zoom, graphic switch, or rhetorical question)

2.67 WHEN the pipeline assembles segments THEN the system SHALL cut away from generic talking-head energy if the visuals weaken the urgency

2.68 WHEN the pipeline assembles under-five-minute videos THEN the system SHALL ensure dead air is almost zero

2.69 WHEN the pipeline assembles segments THEN the system SHALL ensure every segment either escalates, clarifies, or rewards the viewer

2.70 WHEN the pipeline assembles segments THEN the system SHALL trim duplicated lines and repeated stakes

2.71 WHEN the pipeline uses repetition THEN the system SHALL ensure the visuals evolve with it

2.72 WHEN the pipeline assembles segments THEN the system SHALL build pacing in waves (impact, explanation, escalation, relief, impact)

2.73 WHEN the pipeline assembles segments THEN the system SHALL save one high-impact visual sequence for the midpoint to prevent drop-off

2.74 WHEN the pipeline assembles segments THEN the system SHALL end each section with a reason to continue

2.75 WHEN the pipeline assembles segments THEN the system SHALL analyze monotony risk in sequential clips

2.76 WHEN the script becomes conceptual THEN the system SHALL use shorter visual units

2.77 WHEN the pipeline uses slower visuals THEN the system SHALL ensure they create emotional weight

2.78 WHEN the pipeline assembles segments THEN the system SHALL ensure intensity needs contrast, not every scene equally intense

2.79 WHEN the pipeline handles lists or risk cascades THEN the system SHALL use faster graphic rhythm

2.80 WHEN the pipeline assembles the first half THEN the system SHALL prioritize retention over completeness

**Graphics and Motion Design**

2.81 WHEN the pipeline generates motion graphics THEN the system SHALL ensure they explain, not decorate

2.82 WHEN the pipeline generates overlays THEN the system SHALL ensure every lower-third, overlay, or title carries a specific job

2.83 WHEN the pipeline generates on-screen text THEN the system SHALL use large, readable text for key points

2.84 WHEN the pipeline generates on-screen text THEN the system SHALL keep text phrases short enough to process instantly

2.85 WHEN the pipeline generates graphics THEN the system SHALL avoid overdesigned cyber aesthetics that hurt legibility

2.86 WHEN the pipeline generates graphics THEN the system SHALL use glitch effects sparingly to avoid looking cheap and dated

2.87 WHEN the pipeline generates interface mockups THEN the system SHALL make them resemble real software enough to feel believable

2.88 WHEN the pipeline generates icons THEN the system SHALL use them to reinforce meaning, not replace explanation

2.89 WHEN the pipeline generates graphics THEN the system SHALL use one consistent type system across the video package

2.90 WHEN the pipeline generates graphics THEN the system SHALL use a color system that separates danger, information, and solutions clearly

2.91 WHEN the pipeline generates graphics THEN the system SHALL use red for threat, blue/neutral for explanation, and green for action/safety

2.92 WHEN the pipeline generates animated text THEN the system SHALL apply emphasis on key nouns only, not every phrase

2.93 WHEN the pipeline generates subtitles and kinetic text THEN the system SHALL prevent them from competing with each other

2.94 WHEN the pipeline generates map graphics THEN the system SHALL make them simple and high-contrast, not overloaded

2.95 WHEN the pipeline generates graphics THEN the system SHALL detect when footage needs supportive overlays to become understandable

2.96 WHEN the pipeline generates graphics THEN the system SHALL use alert banners, pop-ups, and notification motifs to create urgency

2.97 WHEN the pipeline generates graphics THEN the system SHALL build recurring graphic motifs across episodes for brand recognition

2.98 WHEN the pipeline generates graphics THEN the system SHALL use different motion styles for different story layers (personal, corporate, geopolitical, practical)

2.99 WHEN the pipeline generates typography THEN the system SHALL use modern and authoritative styles, not gamer or sci-fi

2.100 WHEN the pipeline generates graphics THEN the system SHALL score visual readability on mobile before approving a sequence

**Story Structure**

2.101 WHEN the pipeline structures the story THEN the system SHALL open with immediate personal stakes

2.102 WHEN the pipeline structures the story THEN the system SHALL move from individual threat to larger system threat

2.103 WHEN the pipeline structures the story THEN the system SHALL bring the viewer back to themselves regularly

2.104 WHEN the pipeline structures the story THEN the system SHALL use the personal story section as the emotional anchor with concrete details

2.105 WHEN the pipeline structures the story THEN the system SHALL place the most relatable example early, before geopolitics

2.106 WHEN the pipeline structures the story THEN the system SHALL transition into nation-state material with a clear bridge

2.107 WHEN the pipeline structures the story THEN the system SHALL not jump from personal story to military cyber units without setup

2.108 WHEN the pipeline structures the story THEN the system SHALL use "this affects you because…" bridges when the story scales up

2.109 WHEN the pipeline structures the story THEN the system SHALL ensure each section answers one question before opening the next

2.110 WHEN the pipeline structures the story THEN the system SHALL limit the number of big ideas introduced per minute

2.111 WHEN the pipeline structures the story THEN the system SHALL ensure a viewer never needs specialist knowledge to follow the logic

2.112 WHEN the pipeline structures the story THEN the system SHALL make the practical advice section feel earned and useful

2.113 WHEN the pipeline structures the story THEN the system SHALL ensure the ending releases tension by giving agency

2.114 WHEN the pipeline structures the story THEN the system SHALL avoid ending on pure fear without action

2.115 WHEN the pipeline structures the story THEN the system SHALL make the next-video teaser feel like an irresistible continuation

**Credibility and Accuracy**

2.116 WHEN the pipeline generates scripts with statistics THEN the system SHALL flag unsourced statistics for review

2.117 WHEN the pipeline generates scripts with large figures THEN the system SHALL check and normalize figures before final output

2.118 WHEN the pipeline generates scripts with major claims THEN the system SHALL use "according to" language

2.119 WHEN the pipeline references organizations THEN the system SHALL use precise phrasing rather than vague attribution

2.120 WHEN the pipeline generates state-actor attributions THEN the system SHALL present them carefully and not overstate them

2.121 WHEN the pipeline generates scripts THEN the system SHALL distinguish between verified claims, interpretive framing, and opinion

2.122 WHEN the pipeline generates scripts THEN the system SHALL ensure emotional intensity does not come at the expense of trust

2.123 WHEN the pipeline generates scripts THEN the system SHALL optimize for viewers feeling informed, not manipulated

2.124 WHEN the pipeline generates scripts THEN the system SHALL offer a "high drama" mode and a "high credibility" mode, then balance them

2.125 WHEN the pipeline generates scripts THEN the system SHALL use strong authority framing for business-oriented audiences

**Audience Fit**

2.126 WHEN the pipeline generates content THEN the system SHALL use simple language and familiar visual examples for non-technical adults

2.127 WHEN the pipeline generates content THEN the system SHALL address what small business owners care most about (downtime, money loss, customer trust, operational paralysis)

2.128 WHEN the pipeline generates content THEN the system SHALL show consequences they recognize immediately (locked files, fake invoices, frozen POS systems, stolen logins)

2.129 WHEN the pipeline generates content THEN the system SHALL avoid overloading viewers with intelligence-agency detail too early

2.130 WHEN the pipeline discusses geopolitics THEN the system SHALL connect it back to supply chains, utilities, communications, or business systems

2.131 WHEN the pipeline generates content for freelancers THEN the system SHALL address identity theft, account lockout, invoice fraud, and lost client data

2.132 WHEN the pipeline generates protection steps THEN the system SHALL make them look realistic and manageable

2.133 WHEN the pipeline generates content THEN the system SHALL make viewers feel concerned but not helpless

2.134 WHEN the pipeline generates content THEN the system SHALL provide a survival path alongside fear to maintain shareability and satisfaction

2.135 WHEN the pipeline generates content THEN the system SHALL generate audience-specific variants for consumers, freelancers, and small business owners

**Retention Engineering**

2.136 WHEN the pipeline generates scripts THEN the system SHALL add curiosity loops at natural drop-off points

2.137 WHEN the pipeline generates scripts THEN the system SHALL ask questions the next section answers quickly

2.138 WHEN the pipeline generates scripts THEN the system SHALL use mini cliffhangers before transitions

2.139 WHEN the pipeline generates scripts THEN the system SHALL build at least one "this could happen to you in one click" moment

2.140 WHEN the pipeline generates scripts THEN the system SHALL alternate fear with clarity so viewers do not fatigue

2.141 WHEN the pipeline generates scripts THEN the system SHALL use practical payoff after heavy warning sequences

2.142 WHEN the pipeline generates scripts THEN the system SHALL ensure the midpoint intensifies the story or reveals a bigger implication

2.143 WHEN the pipeline generates scripts THEN the system SHALL remove lines that sound good but do not improve retention or understanding

2.144 WHEN the pipeline generates scripts THEN the system SHALL ensure every second has purpose to create density

2.145 WHEN the pipeline generates scripts THEN the system SHALL score each line for necessity, not just grammatical quality

2.146 WHEN the pipeline generates scripts THEN the system SHALL build comment triggers into the ending without making them feel forced

2.147 WHEN the pipeline generates scripts THEN the system SHALL use emotional specificity for strong retention

2.148 WHEN the pipeline generates scripts THEN the system SHALL use concrete examples as retention anchors people remember later

2.149 WHEN the pipeline generates scripts THEN the system SHALL create momentum toward the final warning and solution

2.150 WHEN the pipeline generates scripts THEN the system SHALL ensure the last 20 seconds reward viewers for staying

**Audio and Voice**

2.151 WHEN the pipeline generates audio direction THEN the system SHALL use impact sounds to punctuate critical reveals

2.152 WHEN the pipeline generates audio direction THEN the system SHALL not overfill the mix with constant dramatic music

2.153 WHEN the pipeline generates audio direction THEN the system SHALL leave brief sonic space before major statements

2.154 WHEN the pipeline generates audio direction THEN the system SHALL sync visual hit points with voice emphasis

2.155 WHEN the pipeline generates audio direction THEN the system SHALL use risers only when they support actual escalation

2.156 WHEN the pipeline generates audio direction THEN the system SHALL use a calmer sound bed for practical advice sections than fear sections

2.157 WHEN the pipeline generates audio direction THEN the system SHALL use audio to help define story sections when visuals shift

2.158 WHEN the pipeline generates audio direction THEN the system SHALL align SFX moments to retention-critical lines

2.159 WHEN the pipeline generates audio direction THEN the system SHALL avoid making the entire video one unbroken wall of tension

2.160 WHEN the pipeline generates audio direction THEN the system SHALL ensure the assembly feels edited to the thought, not just to the beat

**Scene Selection Logic**

2.161 WHEN the pipeline selects scenes THEN the system SHALL prioritize clips with clear human emotion

2.162 WHEN the pipeline selects scenes THEN the system SHALL prioritize clips with obvious cause-and-effect

2.163 WHEN the pipeline selects scenes THEN the system SHALL prefer footage with strong silhouette and immediate readability

2.164 WHEN the pipeline selects scenes THEN the system SHALL reject clips that are technically on-topic but visually vague

2.165 WHEN the pipeline selects scenes THEN the system SHALL score footage for emotional clarity, not only semantic relevance

2.166 WHEN the pipeline selects scenes THEN the system SHALL actively diversify repetitive footage

2.167 WHEN the pipeline selects scenes THEN the system SHALL avoid overusing code-on-screen as filler

2.168 WHEN the pipeline selects scenes THEN the system SHALL use screens, hands, faces, offices, shops, and infrastructure to ground the topic

2.169 WHEN the pipeline selects scenes THEN the system SHALL match footage energy to narration energy

2.170 WHEN the pipeline selects scenes THEN the system SHALL use more grounded footage in the first half and conceptual footage only after trust is built

2.171 WHEN the pipeline selects scenes THEN the system SHALL detect stock-footage fatigue risk

2.172 WHEN the pipeline selects scenes THEN the system SHALL prefer human-centered visuals over abstract tech backgrounds for mass audiences

2.173 WHEN the pipeline selects scenes THEN the system SHALL prefer visuals of consequences over visuals of "hackers typing"

2.174 WHEN the pipeline selects scenes THEN the system SHALL add a fresh shot every 15-20 seconds relative to the previous run

2.175 WHEN the pipeline selects scenes THEN the system SHALL maintain a sequence-level diversity score

**Section Design Templates**

2.176 WHEN the pipeline designs personal-risk sections THEN the system SHALL use close shots, screens, alerts, intimate spaces, and readable UI

2.177 WHEN the pipeline designs corporate-risk sections THEN the system SHALL show offices, servers, dashboards, shutdown effects, and team reactions

2.178 WHEN the pipeline designs geopolitical-risk sections THEN the system SHALL use maps, infrastructure, communications, and simple strategic overlays

2.179 WHEN the pipeline designs advice sections THEN the system SHALL use clean checklists, calmer pacing, and reassuring color balance

2.180 WHEN the pipeline designs story-example sections THEN the system SHALL structure them with a mini beginning, disruption, and aftermath

2.181 WHEN the pipeline designs sections THEN the system SHALL assign a visual mode to each section rather than one style for the entire video

2.182 WHEN the pipeline designs sections THEN the system SHALL use section cards or title slams to help orientation when the topic changes

2.183 WHEN the pipeline designs sections THEN the system SHALL use repeated motif transitions so the video feels branded instead of random

2.184 WHEN the pipeline designs the practical-tips section THEN the system SHALL make it feel like a reward state

2.185 WHEN the pipeline designs the final CTA section THEN the system SHALL connect emotionally and visually to the opening problem

**Titles and Framing**

2.186 WHEN the pipeline generates titles THEN the system SHALL replace vague labels with concrete outcomes

2.187 WHEN the pipeline generates verbal framing THEN the system SHALL use "this is how they get in" instead of generic "cyber threats are rising" when possible

2.188 WHEN the pipeline generates on-screen text THEN the system SHALL finish the thought, not duplicate narration word-for-word

2.189 WHEN the pipeline generates on-screen text THEN the system SHALL use headline-style text cards for major reveals

2.190 WHEN the pipeline generates on-screen text THEN the system SHALL avoid too many long sentence subtitles on screen at once

2.191 WHEN the pipeline names complex entities THEN the system SHALL simplify visually for general viewers

2.192 WHEN the pipeline generates verbal framing THEN the system SHALL use audience-facing language ("your files," "your payroll," "your customer data," "your invoices")

2.193 WHEN the pipeline generates packaging THEN the system SHALL use simple nouns and verbs, not broad abstractions

2.194 WHEN the pipeline generates titles THEN the system SHALL generate 10-20 title variants and rank them by specificity and curiosity

2.195 WHEN the pipeline generates titles THEN the system SHALL use stronger title families (loss, exposure, sabotage, shutdown, lockout, one-click disaster)

**AI Tool Rules**

2.196 WHEN the pipeline generates output THEN the system SHALL optimize for click-through and retention together, not one at the expense of the other

2.197 WHEN the pipeline generates output THEN the system SHALL score every video on clarity, urgency, emotional specificity, and credibility

2.198 WHEN the pipeline generates output THEN the system SHALL produce multiple hooks, thumbnails, and scene assemblies automatically

2.199 WHEN the pipeline generates output THEN the system SHALL flag when a section becomes too abstract for the intended audience

2.200 WHEN the pipeline generates output THEN the system SHALL identify repeated visual motifs and suggest replacements

2.201 WHEN the pipeline generates output THEN the system SHALL classify each script line as personal, institutional, geopolitical, or practical, then choose visuals accordingly

2.202 WHEN the pipeline generates output THEN the system SHALL maintain a consistent brand kit (fonts, colors, transitions, lower-thirds, thumbnail logic)

2.203 WHEN the pipeline generates output THEN the system SHALL check mobile readability for thumbnails, text overlays, and UI inserts

2.204 WHEN the pipeline generates output THEN the system SHALL detect unsupported claims or outdated statistics before render

2.205 WHEN the pipeline generates output THEN the system SHALL build a visible "problem to solution" arc into every script

2.206 WHEN the pipeline generates output THEN the system SHALL privilege concrete consequence footage over generic hacker imagery

2.207 WHEN the pipeline generates output THEN the system SHALL learn which hooks perform best per audience profile

2.208 WHEN the pipeline generates output THEN the system SHALL prefer human faces and immediate consequences in the opening package for broad audiences

2.209 WHEN the pipeline generates output THEN the system SHALL reserve abstract war framing for later escalation after trust is built

2.210 WHEN the pipeline generates output THEN the system SHALL generate assembly notes explaining why each clip was chosen

2.211 WHEN the pipeline generates output THEN the system SHALL generate at least one safer credible edit and one more aggressive viral edit per script

2.212 WHEN the pipeline generates output THEN the system SHALL test whether the video still works with sound low

2.213 WHEN the pipeline generates output THEN the system SHALL measure section-level retention risk from repetition, abstraction, and weak visual payoff

2.214 WHEN the pipeline generates output THEN the system SHALL output "must replace" warnings for weak thumbnails or generic openings

2.215 WHEN the pipeline generates output THEN the system SHALL turn improvements into modular templates so future videos improve consistently

**Highest-Priority Changes**

2.216 WHEN the pipeline generates a video THEN the system SHALL automatically replace the thumbnail with a clearer topic-specific concept

2.217 WHEN the pipeline generates a video THEN the system SHALL rewrite the opening 15 seconds for personal stakes and immediate comprehension

2.218 WHEN the pipeline generates a video THEN the system SHALL make the first visuals concrete (money, business systems, identity, lockout)

2.219 WHEN the pipeline generates a video THEN the system SHALL strengthen personal story sequences with more grounded and specific visuals

2.220 WHEN the pipeline generates a video THEN the system SHALL add stronger visual transitions between personal, geopolitical, and practical sections

2.221 WHEN the pipeline generates a video THEN the system SHALL remove repeated wording and duplicated end-stakes lines

2.222 WHEN the pipeline generates a video THEN the system SHALL expand and improve the practical-advice payoff

2.223 WHEN the pipeline generates a video THEN the system SHALL add better source framing for big claims and statistics

2.224 WHEN the pipeline generates a video THEN the system SHALL make the ending feel empowering, not only alarming

2.225 WHEN the pipeline generates a video THEN the system SHALL build the pipeline around clarity first, then drama, then polish

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the pipeline generates a video with valid topic and style inputs THEN the system SHALL CONTINUE TO produce a complete video output (script, media, narration, assembly) without errors

3.2 WHEN the pipeline resolves topic context via Wikipedia THEN the system SHALL CONTINUE TO correctly identify core subjects, entities, and descriptions for visual planning

3.3 WHEN the pipeline sources media from DuckDuckGo, Wikimedia, and Unsplash THEN the system SHALL CONTINUE TO return scored candidates with domain filtering and fallback chains

3.4 WHEN the pipeline generates visual plans via the LLM Visual Director THEN the system SHALL CONTINUE TO produce two-shot plans with specific, searchable concepts (not generic phrases)

3.5 WHEN the pipeline scores image quality via Reka Edge THEN the system SHALL CONTINUE TO evaluate sharpness, lighting, composition, vibrancy, and relevance with composite scoring

3.6 WHEN the pipeline generates SEO titles and descriptions THEN the system SHALL CONTINUE TO produce titles within 40-70 character limits with chapter markers and tags

3.7 WHEN the pipeline builds storyboards THEN the system SHALL CONTINUE TO generate per-second frames with quality labels (strong/okay/weak) and segment summaries

3.8 WHEN the pipeline reorders segments for hook optimization THEN the system SHALL CONTINUE TO move the highest-scored chart segment to index 0 as intro type

3.9 WHEN the pipeline renders video with the existing renderer THEN the system SHALL CONTINUE TO produce valid video output files with correct timing and audio sync

3.10 WHEN the pipeline processes batch jobs THEN the system SHALL CONTINUE TO handle multiple videos in sequence with proper error isolation between jobs
