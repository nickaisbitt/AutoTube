export interface TransitionPlan {
  type: string;
  duration: number;
  easing: string;
  params: Record<string, number>;
}

interface EditPlanTransition {
  type: string;
  duration?: number;
}

interface EditPlanInput {
  transitions?: EditPlanTransition[];
}

const DEFAULT_TRANSITION_DURATION = 0.5;
const DEFAULT_EASING = 'ease_in_out';

const TRANSITION_PARAMS: Record<string, Record<string, number>> = {
  fade: { opacityStart: 1, opacityEnd: 0 },
  dissolve: { blurRadius: 8, opacityStart: 1, opacityEnd: 0 },
  wipe_left: { directionX: -1, directionY: 0 },
  wipe_right: { directionX: 1, directionY: 0 },
  wipe_up: { directionX: 0, directionY: -1 },
  wipe_down: { directionX: 0, directionY: 1 },
  zoom_in: { scaleStart: 1, scaleEnd: 2, centerX: 0.5, centerY: 0.5 },
  zoom_out: { scaleStart: 2, scaleEnd: 1, centerX: 0.5, centerY: 0.5 },
  slide_left: { offsetX: -1, offsetY: 0 },
  slide_right: { offsetX: 1, offsetY: 0 },
  chromatic: { offsetR: 4, offsetG: 0, offsetB: -4, intensity: 1 },
  flash: { flashIntensity: 1, flashDuration: 0.1 },
};

export function createTransitionPlan(
  editPlan: EditPlanInput,
  segmentCount: number,
): TransitionPlan[] {
  const plans: TransitionPlan[] = [];
  const transitions = editPlan.transitions || [];

  const transitionCount = Math.max(0, segmentCount - 1);

  for (let i = 0; i < transitionCount; i++) {
    const editTransition = transitions[i];

    if (editTransition) {
      const type = editTransition.type || 'fade';
      const duration = editTransition.duration || DEFAULT_TRANSITION_DURATION;
      const params = TRANSITION_PARAMS[type] || TRANSITION_PARAMS['fade'];

      plans.push({
        type,
        duration,
        easing: DEFAULT_EASING,
        params: { ...params },
      });
    } else {
      plans.push({
        type: 'fade',
        duration: DEFAULT_TRANSITION_DURATION,
        easing: DEFAULT_EASING,
        params: { ...TRANSITION_PARAMS['fade'] },
      });
    }
  }

  return plans;
}

function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case 'ease_in':
      return t * t;
    case 'ease_out':
      return 1 - (1 - t) * (1 - t);
    case 'ease_in_out':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'linear':
    default:
      return t;
  }
}

export function renderTransitionFrame(
  ctx: any,
  plan: TransitionPlan,
  fromRender: () => void,
  toRender: () => void,
  frameProgress: number,
  w: number,
  h: number,
): void {
  const t = applyEasing(Math.max(0, Math.min(1, frameProgress)), plan.easing);

  ctx.save();

  switch (plan.type) {
    case 'fade': {
      fromRender();
      ctx.globalAlpha = t;
      toRender();
      break;
    }

    case 'dissolve': {
      const blur = (plan.params.blurRadius || 8) * (1 - t);
      ctx.filter = `blur(${blur}px)`;
      fromRender();
      ctx.filter = 'none';
      ctx.globalAlpha = t;
      toRender();
      break;
    }

    case 'wipe_left':
    case 'wipe_right':
    case 'wipe_up':
    case 'wipe_down': {
      const dirX = plan.params.directionX || 0;
      const dirY = plan.params.directionY || 0;
      fromRender();
      ctx.beginPath();
      const clipX = dirX < 0 ? w * (1 - t) : dirX > 0 ? 0 : 0;
      const clipY = dirY < 0 ? h * (1 - t) : dirY > 0 ? 0 : 0;
      const clipW = dirX !== 0 ? w * t : w;
      const clipH = dirY !== 0 ? h * t : h;
      ctx.rect(clipX, clipY, clipW, clipH);
      ctx.clip();
      toRender();
      break;
    }

    case 'zoom_in':
    case 'zoom_out': {
      const scaleStart = plan.params.scaleStart || 1;
      const scaleEnd = plan.params.scaleEnd || 2;
      const scale = scaleStart + (scaleEnd - scaleStart) * t;
      const cx = (plan.params.centerX || 0.5) * w;
      const cy = (plan.params.centerY || 0.5) * h;

      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = 1 - t;
      fromRender();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(cx, cy);
      ctx.scale(1 / scale, 1 / scale);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = t;
      toRender();
      break;
    }

    case 'slide_left':
    case 'slide_right': {
      const offsetX = (plan.params.offsetX || 0) * w * t;
      ctx.translate(-offsetX, 0);
      fromRender();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(w - offsetX, 0);
      toRender();
      break;
    }

    case 'chromatic': {
      fromRender();
      ctx.globalAlpha = t;
      toRender();
      break;
    }

    case 'flash': {
      const flashIntensity = plan.params.flashIntensity || 1;
      const flashPhase = plan.params.flashDuration || 0.1;

      if (t < flashPhase) {
        fromRender();
        ctx.globalAlpha = (t / flashPhase) * flashIntensity;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
      } else {
        toRender();
        const fadeOut = 1 - ((t - flashPhase) / (1 - flashPhase));
        ctx.globalAlpha = fadeOut * flashIntensity * 0.5;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }

    default: {
      fromRender();
      ctx.globalAlpha = t;
      toRender();
      break;
    }
  }

  ctx.restore();
}

export function computeTransitionFrameCount(plan: TransitionPlan, fps: number): number {
  return Math.max(1, Math.round(plan.duration * fps));
}
