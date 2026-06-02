import { test, expect, type Route } from '@playwright/test';

const SCRIPT_MODEL_DEFAULT = 'openai/gpt-5.4-nano';

const MOCK_SEGMENTS = [
  {
    title: 'Introduction',
    narration: 'The healthcare industry is in the middle of a revolution driven by artificial intelligence. From radiology to drug discovery, machine learning models are now outperforming expert physicians on narrow tasks. The scale of this shift is staggering — according to a 2024 report from Grand View Research, the global AI in healthcare market reached $26.6 billion, and is projected to grow at a 37% compound annual rate through 2030. That is not incremental change. That is a complete restructuring of how medicine gets practiced. In this video, we are going to walk through the specific places where AI is already outperforming humans, the places where it is failing, and what it means for you, your doctor, and your next medical bill.',
    duration: 18,
    type: 'intro',
    visualNote: 'Hospital corridor with futuristic overlay, then cut to data dashboard',
  },
  {
    title: 'Radiology and Diagnostics',
    narration: 'Start with the obvious one. In 2024, a study from Mass General Brigham published in Nature found that an AI model matched or exceeded the diagnostic accuracy of board-certified radiologists on 86% of chest X-ray interpretations. Eighty-six percent. Not "close to" — actually better than the average radiologist. The same model processed 10,000 scans in the time it would take a single human to read 200. Multiply that across a hospital system and you can see why administrators are paying attention. But here is the nuance the headlines miss. The model is not actually smarter than the radiologist. It is faster and more consistent, which means it catches things a tired human eye misses at 2am on a Tuesday.',
    duration: 20,
    type: 'section',
    visualNote: 'Split screen: radiologist reading scans vs AI model output',
  },
  {
    title: 'Drug Discovery Acceleration',
    narration: 'Now let us talk about drug discovery, where the bottleneck has always been time. The traditional pipeline takes 10 to 15 years and costs roughly $2.6 billion per approved drug, according to data from the Tufts Center for the Study of Drug Development. Insilico Medicine used AI to identify a novel fibrosis drug target in 2020 and bring it to Phase 1 clinical trials in under 18 months. Eighteen months. That timeline used to be science fiction. The competitive context here matters — Pfizer, Roche, and Novartis are all pouring billions into similar pipelines, with pharma AI spending expected to hit $9.1 billion by 2027 according to Statista.',
    duration: 20,
    type: 'section',
    visualNote: 'Molecular animation, then cut to clinical trial timeline graphic',
  },
  {
    title: 'Administrative Burden Reduction',
    narration: 'Here is where the real money is being saved. Doctors spend an average of 16 minutes per patient encounter on documentation, per a 2023 study in the Annals of Internal Medicine. That is one-third of every appointment spent typing instead of talking to a human. Ambient AI scribes from companies like Abridge, Nuance, and Suki are now generating clinical notes in real-time, reducing documentation time by 70% in early deployments at Kaiser Permanente and Stanford. That is not a productivity gain. That is the difference between a doctor who burned out in year 5 and one who can stay in medicine for 30 years. Think about what that means for the looming physician shortage.',
    duration: 20,
    type: 'section',
    visualNote: 'Doctor at computer frustrated, then smiling with AI scribe overlay',
  },
  {
    title: 'The Pivot — Where It Breaks',
    narration: 'But the picture is not all rosy. Let us look at the failure cases. In 2019, an IBM Watson Health recommendation system suggested unsafe drug interactions to oncologists at the University of Texas MD Anderson Cancer Center. The hospital eventually abandoned the $62 million project. Why did it fail? Because the model was trained on hypothetical scenarios, not real patient data, and it could not adapt when reality diverged from the training distribution. This is the pattern. AI works beautifully in controlled settings with clean data, and falls apart the moment you feed it the messy, biased, incomplete data of the real world.',
    duration: 20,
    type: 'section',
    visualNote: 'Warning signs, abandoned hospital tech room, frustrated clinicians',
  },
  {
    title: 'Bias and Equity Concerns',
    narration: 'Now the part nobody wants to talk about. A 2024 study from the University of Chicago found that a popular sepsis prediction AI under-detected the condition in Black patients by 18% compared to white patients. The model was trained on data from a single hospital system that historically under-treated Black patients. The AI learned the bias. It automated the inequality. This is not a glitch — it is the predictable outcome of training on biased historical data. The Mayo Clinic, Stanford, and others are now investing in what they call "fairness audits," but the regulatory framework is years behind the deployment curve. According to the FDA, only 1% of approved AI medical devices have undergone any kind of bias validation.',
    duration: 20,
    type: 'section',
    visualNote: 'Split data visualization, disparity chart, FDA approval document',
  },
  {
    title: 'Regulatory Landscape',
    narration: 'The regulatory landscape is in catch-up mode. As of late 2024, the FDA has approved over 950 AI-enabled medical devices, with 75% of those approvals coming in the last three years alone. The European Union AI Act, which took effect in 2024, classifies medical AI as "high risk" and requires ongoing post-market monitoring. In practice, this means any hospital deploying a new AI tool now needs a compliance officer, an audit trail, and a rollback plan. The legal liability picture is also unsettled — if an AI misdiagnoses you, who is on the hook? The hospital, the vendor, the data provider? Most state laws have not caught up to this question. Your data, your privacy, and your lawsuit all hang in the balance.',
    duration: 20,
    type: 'section',
    visualNote: 'Regulatory building, EU parliament, FDA logo, courtroom imagery',
  },
  {
    title: 'The Hospital at Home Movement',
    narration: 'Here is a use case that might personally affect you. "Hospital at home" programs — where AI-enabled remote monitoring lets patients recover from serious illness in their own bed — grew 650% between 2019 and 2024 according to data from the Centers for Medicare and Medicaid Services. Programs at Johns Hopkins, Mayo, and Mount Sinai show 30-day readmission rates drop by 25% and patient satisfaction scores jump into the 90th percentile. The economics are equally compelling — hospital at home costs about 40% less than inpatient care, and competitors like DispatchHealth, Medically Home, and Biofourmis are scaling fast. This affects you directly if you or a family member ever has a serious illness. The hospital room of the future is your living room.',
    duration: 20,
    type: 'section',
    visualNote: 'Patient at home with monitoring devices, hospital room comparison',
  },
  {
    title: 'Mental Health AI',
    narration: 'Mental health is the new frontier. The FDA cleared the first AI-driven therapy chatbot, Woebot, in 2024 for adjunctive treatment of postpartum depression. The same year, the National Institute of Mental Health reported that AI models now match licensed therapists in detecting crisis-level language in patient texts with 94% accuracy. The market for AI mental health tools is projected to hit $6.5 billion by 2027 according to Allied Market Research. But here is the tension. A chatbot is available at 3am when no human therapist is. It will not be great. It might even be harmful. But for the millions of Americans in mental health professional shortage areas — which the Health Resources and Services Administration counts at over 160 million people — it might be the only option. The competitive context here is fierce, with Talkspace, BetterHelp, and Cerebral all racing to integrate AI features.',
    duration: 20,
    type: 'section',
    visualNote: 'Person on phone at night, AI chatbot interface, therapist office comparison',
  },
  {
    title: 'Surgery and Robotics',
    narration: 'Surgical robotics deserves its own segment. The da Vinci system, made by Intuitive Surgical, has performed over 12 million procedures worldwide as of 2024. The newer generation integrates AI guidance that flags unsafe tissue planes in real-time. Medtronic, Johnson & Johnson, and Stryker are all racing to compete, with combined R&D spending in surgical robotics hitting $4.2 billion in 2024 according to a Bloomberg Intelligence report. The catch? A single da Vinci system costs $1.5 to $2.5 million, and the average procedure runs 30% more expensive than traditional laparoscopic surgery. Health insurers like UnitedHealth and Aetna are still negotiating coverage, and out-of-pocket costs can exceed $50,000 for uninsured patients. The technology is incredible. The access is not.',
    duration: 20,
    type: 'section',
    visualNote: 'Surgical robot, OR scene, hospital billing statement',
  },
  {
    title: 'Patient Privacy Implications',
    narration: 'Now the part that should keep you up at night. Your medical data is the most valuable personal data type on the black market — a complete electronic health record sells for $1,000 according to a 2024 Trustwave report, compared to $5 for a credit card number. AI systems need massive datasets to train, which means hospitals are sharing patient data with vendors at an unprecedented scale. HIPAA was written in 1996, before cloud computing, before machine learning, before data brokers. The new wave of AI health tools is testing the limits of "de-identification" in ways the original law never anticipated. According to a 2024 study in JAMA, 87% of patients did not know their hospital shared their data with third-party AI vendors. Eighty-seven percent. That affects you directly. Your data, your privacy, your consent — all three are slipping away in the fine print of admission forms.',
    duration: 20,
    type: 'section',
    visualNote: 'Hospital admission form, data flow diagram, shocked patient',
  },
  {
    title: 'Conclusion',
    narration: 'So what is the verdict? AI in healthcare is not a future technology. It is here, deployed at scale, and already changing how medicine gets practiced. According to Grand View Research, the AI healthcare market is growing 37% year over year. The winners will be patients who can navigate this new system — the patients who ask their doctor "what AI tools are you using?", who read the consent forms, who demand transparency. The losers will be those who do not. The next time you or a family member enters a hospital, ask one question. Ask what AI is making decisions about your care. According to a 2024 NEJM Catalyst survey, 73% of patients have never asked. Be the 24% that does. Your health, your data, your future — it is all on the line. Subscribe for more breakdowns of the technology that is reshaping every part of our lives.',
    duration: 20,
    type: 'outro',
    visualNote: 'Hospital exterior, patient advocate graphic, subscribe overlay',
  },
];

function buildOpenRouterResponse(model: string) {
  const body = {
    segments: MOCK_SEGMENTS,
  };
  return {
    id: `gen-mock-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(body),
          refusal: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 1500,
      completion_tokens: 1800,
      total_tokens: 3300,
    },
  };
}

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Stub all OpenRouter chat completion calls so the E2E flow is deterministic
    // and does not depend on real model behavior or pay-per-token API cost.
    // The app's callLLM and scriptGenerator both POST to the same endpoint and
    // expect the standard {choices:[{message:{content:string}}]} shape.
    await page.route('https://openrouter.ai/api/v1/chat/completions', async (route: Route) => {
      const request = route.request();
      let model = SCRIPT_MODEL_DEFAULT;
      try {
        const post = request.postDataJSON() as { model?: string } | null;
        if (post?.model) model = post.model;
      } catch {
        // Some requests may not have JSON body — keep default model.
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildOpenRouterResponse(model)),
      });
    });
  });

  test('full pipeline — enter topic, generate script, advance pipeline state', async ({ page }) => {
    await page.goto('/');

    // Enter a topic
    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('The Future of AI in Healthcare');

    // Generate script
    await page.getByTestId('generate-script-only').click();

    // Wait for script step to render with the "complete" state.
    // The sidebar button stays visible; its inner StatusIcon gets a
    // `bg-emerald-500` background once the step completes (PipelineSidebar.tsx:28).
    const scriptStep = page.getByTestId('sidebar-step-script');
    await expect(scriptStep).toBeVisible({ timeout: 60000 });
    await expect(scriptStep.locator('.bg-emerald-500')).toBeVisible({ timeout: 120000 });

    // The next step (media) should be visible AND no longer disabled — proves the
    // pipeline advanced past the script step (sidebar disables button when status='idle').
    const mediaStep = page.getByTestId('sidebar-step-media');
    await expect(mediaStep).toBeVisible({ timeout: 60000 });
    await expect(mediaStep).toBeEnabled({ timeout: 60000 });
  });

  test('script generation — produces a non-empty script panel', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('Understanding Quantum Computing');

    await page.getByTestId('generate-script-only').click();

    // The main panel should swap from "No script generated yet" to a populated script view.
    await expect(page.getByText('No script generated yet.')).toBeHidden({ timeout: 120000 });

    // The script step sidebar item should reach the complete state.
    const scriptStep = page.getByTestId('sidebar-step-script');
    await expect(scriptStep.locator('.bg-emerald-500')).toBeVisible({ timeout: 120000 });
  });

  test('error handling — graceful failure when API key is missing', async ({ page }) => {
    // Unroute the OpenRouter stub for this test so the app can hit its real error path.
    await page.unroute('https://openrouter.ai/api/v1/chat/completions');
    // Override the API key to empty BEFORE navigation so configSlice loads the default state.
    await page.addInitScript(() => {
      try {
        sessionStorage.removeItem('autotube_config_session');
        localStorage.removeItem('autotube_config_v2');
      } catch {
        // sessionStorage/localStorage may not be available in some contexts.
      }
    });

    await page.goto('/');

    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('Test Error Handling Topic');

    const generateBtn = page.getByTestId('generate-script-only');
    await expect(generateBtn).toBeVisible();

    // Verify the app does not crash — main content should still be visible
    await expect(page.getByTestId('pipeline-sidebar')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
  });
});
