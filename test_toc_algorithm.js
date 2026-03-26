// 목차 추출 알고리즘 테스트 스크립트

// 테스트용 가상 PDF 파일 (실제 파일이 없으므로 구조만 테스트)
async function testTocAlgorithm() {
  console.log('목차 추출 알고리즘 테스트 시작...\n');
  
  // 테스트 케이스 1: 다양한 목차 형식
  const testCases = [
    {
      name: '영어 목차 형식',
      lines: [
        'Table of Contents',
        '',
        'Chapter 1: Introduction ........... 1',
        'Chapter 2: Literature Review ...... 15',
        'Chapter 3: Methodology ............ 32',
        'Chapter 4: Results ................ 48',
        'Chapter 5: Discussion ............. 65',
        'References ....................... 80'
      ],
      expected: 4 // Chapter 1-4까지 감지
    },
    {
      name: '한국어 목차 형식',
      lines: [
        '목차',
        '',
        '제1장 서론 ....................... 1',
        '제2장 이론적 배경 ................ 12',
        '제3장 연구 방법 .................. 25',
        '제4장 실험 결과 .................. 38',
        '제5장 결론 ....................... 52',
        '참고문헌 ......................... 65'
      ],
      expected: 5 // 제1장-제5장까지 감지
    },
    {
      name: '간단한 번호 형식',
      lines: [
        'Contents',
        '',
        '1. Introduction .................. 1',
        '2. Background .................... 10',
        '3. Implementation ................ 22',
        '4. Evaluation .................... 35',
        '5. Conclusion .................... 47'
      ],
      expected: 5 // 1-5까지 감지
    },
    {
      name: '섹션 형식',
      lines: [
        'Table of Contents',
        '',
        'Section 1.1 Overview ............. 1',
        'Section 1.2 Details .............. 8',
        'Section 2.1 Analysis ............. 15',
        'Section 2.2 Results .............. 24',
        'Appendix A ....................... 32'
      ],
      expected: 4 // Section 1.1-2.2까지 감지
    }
  ];

  for (const testCase of testCases) {
    console.log(`테스트: ${testCase.name}`);
    console.log('샘플 목차:');
    testCase.lines.forEach(line => console.log(`  ${line}`));
    
    // 간단한 분석 함수 (실제 PDF가 없으므로 텍스트 분석만)
    const pageText = testCase.lines.join(' ');
    const keywordHits = countTocKeywordHits(pageText);
    
    console.log(`\n키워드 히트 수: ${keywordHits}`);
    console.log(`예상 감지 항목 수: ${testCase.expected}`);
    console.log('---\n');
  }

  console.log('알고리즘 개선 사항 요약:');
  console.log('1. 확장된 정규식 패턴: 영어, 한국어, 일본어, 중국어 목차 지원');
  console.log('2. 다양한 페이지 번호 형식: p. 12, page 12, 12쪽, ページ12 등');
  console.log('3. 향상된 신뢰도 점수 체계: 키워드, 헤더, 항목 수, 연속성 등 종합 평가');
  console.log('4. 연속적인 페이지 번호 감지: 목차 항목의 페이지 번호 패턴 분석');
  console.log('5. 다국어 키워드 지원: table of contents, 목차, 目次, 目录 등');
}

// 테스트용 countTocKeywordHits 함수 (pdf.js에서 복사)
function countTocKeywordHits(text) {
  const raw = String(text || "");
  if (!raw) return 0;

  let hits = 0;
  const lower = raw.toLowerCase();
  
  // 영어 목차 키워드
  if (lower.includes("table of contents")) hits += 3;
  if (lower.includes("contents")) hits += 2;
  if (lower.includes("toc")) hits += 1;
  
  const englishMatches = lower.match(/\bcontents?\b/g);
  if (englishMatches) hits += Math.min(3, englishMatches.length);

  // 한국어 목차 키워드
  const koreanMatches = raw.match(/\uBAA9\uCC28|\uCC28\uB840/g);
  if (koreanMatches) hits += Math.min(4, koreanMatches.length * 2);

  // 일본어 목차 키워드
  const japaneseMatches = raw.match(/\u76EE\u6B21|\u76EE\u9304|\u518A\u9996/g);
  if (japaneseMatches) hits += Math.min(3, japaneseMatches.length * 2);

  // 중국어 목차 키워드
  const chineseMatches = raw.match(/\u76EE\u5F55|\u518A\u9996|\u7B2C\d+\u7AE0/g);
  if (chineseMatches) hits += Math.min(3, chineseMatches.length * 2);

  // 챕터/파트 관련 키워드
  const chapterKeywords = lower.match(/\b(chapter|chap|ch|part|unit|section|sec)\b\.?\s*\d+/g);
  if (chapterKeywords) hits += Math.min(3, chapterKeywords.length);

  return hits;
}

// 테스트 실행
testTocAlgorithm().catch(console.error);