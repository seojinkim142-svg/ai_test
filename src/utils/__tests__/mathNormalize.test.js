import { normalizeMathMarkdown } from "../mathNormalize";

// AI가 $ 구분자를 잘못 쓰는 패턴이 계속 새로 나타나서, 실제로 화면이 깨졌던
// 케이스를 전부 여기에 고정해둔다. 새 깨짐 패턴을 고칠 때마다 여기에 추가할 것.
// LaTeX 백슬래시가 JS 이스케이프로 먹히지 않도록 String.raw 를 사용한다.
describe("normalizeMathMarkdown - 실제로 화면이 깨졌던 회귀 케이스", () => {
  const countDollars = (text) => (text.match(/\$/g) || []).length;

  test("여는 구분자를 $$$$로 겹쳐 쓴 경우 $$ 한 쌍으로 정리된다", () => {
    const out = normalizeMathMarkdown(String.raw`$$$$\frac{y-2}{x+y-3}$$`);
    expect(out).not.toMatch(/\${3,}/);
    expect(out).toContain(String.raw`\frac{y-2}{x+y-3}`);
    expect(countDollars(out)).toBe(4); // 여는 $$ + 닫는 $$
  });

  test("$ 3개로 시작하는 집합 표기가 깨지지 않는다", () => {
    const out = normalizeMathMarkdown(
      String.raw`$$$S = \{RR,\ RG,\ RB,\ GR,\ GG,\ GB,\ BR,\ BG,\ BB\}$$`
    );
    expect(out).not.toMatch(/\${3,}/);
    // 수식 안쪽에 홀로 남은 $ 가 없어야 KaTeX 파싱 에러가 안 난다
    expect(out.replace(/^\$\$|\$\$$/g, "")).not.toContain("$");
  });

  test("aligned 블록 안에서 줄마다 $$로 감싼 경우 하나의 블록으로 합쳐진다", () => {
    const raw = [
      String.raw`\begin{aligned}$$`,
      String.raw`$$\lim_{(x,y)\to(1,2)} \frac{y-2}{x+y-3}$$`,
      String.raw`$$&= \lim_{y \to 2} \frac{y-2}{1+y-3}$$`,
      String.raw`$$&= 1$$`,
      String.raw`$$\end{aligned}`,
    ].join("\n");
    const out = normalizeMathMarkdown(raw);
    expect(out).toContain(String.raw`\begin{aligned}`);
    expect(out).toContain(String.raw`\end{aligned}`);
    // 환경 블록 내부에는 $ 구분자가 남아있으면 안 된다
    const start = out.indexOf(String.raw`\begin{aligned}`);
    const end = out.indexOf(String.raw`\end{aligned}`);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(out.slice(start, end)).not.toContain("$");
  });

  test("짝 안 맞는 begin/end 사이의 마크다운을 통째로 삼키지 않는다", () => {
    const raw = [
      String.raw`\begin{aligned}`,
      String.raw`&= 1 $$`,
      "",
      "### 5. 직관적 이해",
      "",
      "**중요한** 내용입니다.",
      "",
      String.raw`\end{aligned}`,
    ].join("\n");
    const out = normalizeMathMarkdown(raw);
    // 제목과 굵게 표시가 수식 안으로 빨려들어가면 안 된다
    expect(out).toContain("### 5. 직관적 이해");
    expect(out).toContain("**중요한**");
  });

  test("플레이스홀더 토큰이 결과에 노출되지 않는다", () => {
    const raw = [
      String.raw`\begin{aligned}$$`,
      String.raw`$$|f(x,y) - 2|$$`,
      String.raw`$$&= \left|\frac{x^3}{2x^2+y^2}\right|$$`,
      String.raw`$$\end{aligned}`,
    ].join("\n");
    const out = normalizeMathMarkdown(raw);
    expect(out).not.toMatch(/@@MATH_?\d+@@/);
  });

  test("코드블록 안의 내용은 건드리지 않는다 (그래프 JSON 등)", () => {
    const raw = [
      "설명 sqrt(9-x^2) 입니다.",
      "",
      "```graph",
      '{"type":"3d","expr":"sqrt(36 - 9*x^2 - 4*y^2)","xMin":-2.5}',
      "```",
    ].join("\n");
    const out = normalizeMathMarkdown(raw);
    expect(out).toContain('"expr":"sqrt(36 - 9*x^2 - 4*y^2)"');
    // 코드블록 밖의 sqrt 는 LaTeX 로 변환된다
    expect(out).toContain(String.raw`$\sqrt{9-x^2}$`);
  });

  test("정상적인 수식은 그대로 유지된다", () => {
    const raw = "이변수 함수 $f(x,y) = x^2 + y^2$ 의 그래프는\n\n$$z = x^2 + y^2$$\n\n입니다.";
    const out = normalizeMathMarkdown(raw);
    expect(out).toContain("$f(x,y) = x^2 + y^2$");
    expect(out).toContain("$$z = x^2 + y^2$$");
  });

  test("빈 입력에서 죽지 않는다", () => {
    expect(normalizeMathMarkdown("")).toBe("");
    expect(normalizeMathMarkdown(null)).toBe("");
    expect(normalizeMathMarkdown(undefined)).toBe("");
  });
});
