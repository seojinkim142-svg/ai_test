// 플래시카드 앞면 텍스트를 중복 비교용으로 정규화
// 공백/대소문자/구분기호(-, _, 공백) 차이로 인한 중복 미감지를 줄인다
export function normalizeFlashcardFront(front) {
  return String(front || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}
