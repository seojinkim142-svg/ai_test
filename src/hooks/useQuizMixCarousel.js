import { useCallback, useEffect, useRef } from "react";

export function useQuizMixCarousel({ quizMix, quizMixOptions, setQuizMix }) {
  const quizMixScrollRef = useRef(null);
  const quizMixScrollRafRef = useRef(null);
  const quizMixScrollEndRef = useRef(null);
  const quizMixSkipCenterRef = useRef(false);
  const quizMixHasCenteredRef = useRef(false);

  const findQuizMixIndex = useCallback(
    (mix) =>
      quizMixOptions.findIndex(
        (option) =>
          option.multipleChoice === mix?.multipleChoice &&
          option.shortAnswer === mix?.shortAnswer
      ),
    [quizMixOptions]
  );

  const centerQuizMix = useCallback((index, behavior = "smooth") => {
    const container = quizMixScrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-mix-index="${index}"]`);
    if (!target) return;
    const left =
      target.offsetLeft + target.offsetWidth / 2 - container.clientWidth / 2;
    container.scrollTo({ left, behavior });
  }, []);

  const handleQuizMixScroll = useCallback(() => {
    const container = quizMixScrollRef.current;
    if (!container) return;
    quizMixSkipCenterRef.current = true;
    if (quizMixScrollEndRef.current) clearTimeout(quizMixScrollEndRef.current);
    quizMixScrollEndRef.current = setTimeout(() => {
      quizMixSkipCenterRef.current = false;
    }, 160);

    if (quizMixScrollRafRef.current)
      cancelAnimationFrame(quizMixScrollRafRef.current);
    quizMixScrollRafRef.current = requestAnimationFrame(() => {
      const center = container.scrollLeft + container.clientWidth / 2;
      const items = container.querySelectorAll("[data-mix-index]");
      let closestIndex = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      items.forEach((item) => {
        const itemCenter = item.offsetLeft + item.offsetWidth / 2;
        const distance = Math.abs(center - itemCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = Number(item.dataset.mixIndex);
        }
      });
      if (closestIndex === null || Number.isNaN(closestIndex)) return;
      const option = quizMixOptions[closestIndex];
      if (!option) return;
      if (
        option.multipleChoice !== quizMix?.multipleChoice ||
        option.shortAnswer !== quizMix?.shortAnswer
      ) {
        setQuizMix(option);
      }
    });
  }, [quizMix, quizMixOptions, setQuizMix]);

  useEffect(() => {
    const index = findQuizMixIndex(quizMix);
    if (index < 0) return;
    if (quizMixSkipCenterRef.current) return;
    const behavior = quizMixHasCenteredRef.current ? "smooth" : "auto";
    quizMixHasCenteredRef.current = true;
    centerQuizMix(index, behavior);
  }, [centerQuizMix, findQuizMixIndex, quizMix]);

  useEffect(
    () => () => {
      if (quizMixScrollEndRef.current) clearTimeout(quizMixScrollEndRef.current);
      if (quizMixScrollRafRef.current)
        cancelAnimationFrame(quizMixScrollRafRef.current);
    },
    []
  );

  return {
    quizMixScrollRef,
    handleQuizMixScroll,
  };
}
