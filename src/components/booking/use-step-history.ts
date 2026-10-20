// Each booking step is a browser history entry (PO 21/10/2026): the browser or
// phone back gesture and the in-page "Quay lại" walk back through the steps the
// customer came through, instead of leaving the form. The step sits in the URL as
// ?step=N (absent for step 1). A step may come after a higher one (the assistant
// flow goes 1 → 3 → 2 → 4), so "back" means "a step already visited", not a
// smaller number.
import { watch, type Ref } from 'vue';
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router';

type StepRouter = Pick<Router, 'push' | 'replace' | 'go'>;

function stepFromQuery(raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw ?? 1);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

export function useStepHistory(step: Ref<number>, router: StepRouter, route: Pick<RouteLocationNormalizedLoaded, 'query'>) {
  /** The step of each history entry this form pushed, oldest first. */
  const visited: number[] = [step.value];
  /** Set while the step follows the URL, so that change is not pushed again. */
  let followingUrl = false;

  const queryFor = (target: number): LocationQuery => {
    const rest = { ...route.query };
    delete rest.step;
    return target > 1 ? { ...rest, step: String(target) } : rest;
  };

  // A reload or a shared link never lands mid-form: the answers are not kept.
  if (route.query.step !== undefined) void router.replace({ query: queryFor(step.value) });

  watch(step, (now) => {
    if (followingUrl) {
      followingUrl = false;
      return;
    }
    const at = visited.lastIndexOf(now);
    if (at === -1) {
      visited.push(now);
      void router.push({ query: queryFor(now) });
    } else if (at < visited.length - 1) {
      // Back inside the page ("Quay lại", "Sửa"): rewind the history to that entry.
      const delta = at - (visited.length - 1);
      visited.length = at + 1;
      router.go(delta);
    }
  });

  watch(() => route.query.step, (raw) => {
    const wanted = stepFromQuery(raw);
    if (wanted === step.value) return;
    const at = visited.lastIndexOf(wanted);
    if (at !== -1 && at < visited.length - 1) {
      visited.length = at + 1;
      followingUrl = true;
      step.value = wanted;
    } else {
      // Browser "forward" to a step left behind: stay where the customer is.
      void router.replace({ query: queryFor(step.value) });
    }
  });
}
