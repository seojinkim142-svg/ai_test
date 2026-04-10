const TUTOR_COPY = {
  ko: {
    title: "AI 튜터",
    currentDocument: (fileName) => `현재 문서: ${fileName}`,
    resetChat: "대화 초기화",
    emptyState: "질문을 입력하거나 스크린샷을 첨부해 설명을 받아보세요.",
    generatingAnswer: "답변 생성 중...",
    placeholder: "질문을 입력하세요. 스크린샷도 첨부할 수 있습니다.",
    screenshotBadge: "스크린샷",
    attachScreenshot: "스크린샷 첨부",
    replaceScreenshot: "스크린샷 바꾸기",
    remove: "제거",
    send: "전송",
    sending: "전송 중...",
    attachmentLabel: (name) => `첨부 이미지: ${name}`,
    defaultAttachmentPrompt: "첨부한 스크린샷을 학생이 이해하기 쉽게 설명해주세요.",
    notices: {
      openFileOrAttach: "PDF를 열거나 스크린샷을 첨부해 튜터에게 질문하세요.",
      pdfOnlyForPageGrounded:
        "페이지 기준 튜터 모드는 PDF가 필요합니다. 스크린샷을 첨부한 질문은 계속 가능합니다.",
      extractingText:
        "PDF 텍스트를 추출하는 중입니다. 스크린샷 질문은 바로 보낼 수 있습니다.",
      scannedPdfFallback:
        "스캔형 PDF도 가능합니다. 필요하면 튜터가 주변 페이지를 확인하고 OCR도 자동으로 시도합니다.",
    },
    errors: {
      openFileOrAttach: "튜터에게 질문하려면 PDF를 열거나 스크린샷을 첨부하세요.",
      waitForPdfOrAttach:
        "PDF 텍스트 추출이 아직 끝나지 않았습니다. 잠시 기다리거나 스크린샷을 첨부하세요.",
      onlyImageFiles: "튜터에는 이미지 파일만 첨부할 수 있습니다.",
      noReadableScreenshotText: "스크린샷에서 읽을 수 있는 텍스트를 찾지 못했습니다.",
      failedToReadScreenshot: (message) => `스크린샷을 읽지 못했습니다: ${message}`,
      pageInfoUnavailable: "페이지 정보를 확인할 수 없습니다. PDF를 다시 열고 시도해주세요.",
      replyFailed: (message) => `AI 튜터 답변 생성에 실패했습니다: ${message}`,
    },
    status: {
      preparingScreenshot: "스크린샷 준비 중...",
    },
  },
  en: {
    title: "AI Tutor",
    currentDocument: (fileName) => `Current document: ${fileName}`,
    resetChat: "Reset chat",
    emptyState: "Ask a question, or attach a screenshot for the tutor to explain.",
    generatingAnswer: "Generating answer...",
    placeholder: "Ask a question. You can also attach a screenshot.",
    screenshotBadge: "Screenshot",
    attachScreenshot: "Attach screenshot",
    replaceScreenshot: "Replace screenshot",
    remove: "Remove",
    send: "Send",
    sending: "Sending...",
    attachmentLabel: (name) => `Attached image: ${name}`,
    defaultAttachmentPrompt: "Explain the attached screenshot clearly for a student.",
    notices: {
      openFileOrAttach: "Open a PDF, or attach a screenshot to ask the tutor.",
      pdfOnlyForPageGrounded:
        "Page-grounded tutor mode needs a PDF. You can still attach a screenshot and ask from that image.",
      extractingText:
        "PDF text extraction is still running. Screenshot questions can still be sent right away.",
      scannedPdfFallback:
        "Scanned PDFs can still work. The tutor will inspect nearby pages and try OCR automatically when needed.",
    },
    errors: {
      openFileOrAttach: "Open a PDF or attach a screenshot before asking the tutor.",
      waitForPdfOrAttach: "PDF text extraction is still running. Attach a screenshot or wait a moment.",
      onlyImageFiles: "Only image files can be attached to the tutor.",
      noReadableScreenshotText: "No readable text was found in the screenshot.",
      failedToReadScreenshot: (message) => `Failed to read the screenshot: ${message}`,
      pageInfoUnavailable: "Page information is unavailable. Reopen the PDF and try again.",
      replyFailed: (message) => `AI tutor reply failed: ${message}`,
    },
    status: {
      preparingScreenshot: "Preparing screenshot...",
    },
  },
  zh: {
    title: "AI 导学",
    currentDocument: (fileName) => `当前文档：${fileName}`,
    resetChat: "重置对话",
    emptyState: "请输入问题，或上传截图让 AI 讲解。",
    generatingAnswer: "正在生成回答...",
    placeholder: "请输入问题。也可以上传截图。",
    screenshotBadge: "截图",
    attachScreenshot: "上传截图",
    replaceScreenshot: "更换截图",
    remove: "移除",
    send: "发送",
    sending: "发送中...",
    attachmentLabel: (name) => `已附加图片：${name}`,
    defaultAttachmentPrompt: "请把这张截图的内容清楚地讲解给学生。",
    notices: {
      openFileOrAttach: "请打开 PDF，或上传截图向 AI 导学提问。",
      pdfOnlyForPageGrounded: "基于页面的导学模式需要 PDF，但你仍然可以上传截图提问。",
      extractingText: "PDF 文本仍在提取中。截图问题可以立即发送。",
      scannedPdfFallback: "扫描版 PDF 也可以使用。需要时，AI 会自动查看附近页面并尝试 OCR。",
    },
    errors: {
      openFileOrAttach: "提问前请先打开 PDF 或上传截图。",
      waitForPdfOrAttach: "PDF 文本仍在提取中。请稍候，或直接上传截图。",
      onlyImageFiles: "AI 导学只支持上传图片文件。",
      noReadableScreenshotText: "截图中未找到可读取的文字。",
      failedToReadScreenshot: (message) => `无法读取截图：${message}`,
      pageInfoUnavailable: "无法获取页码信息。请重新打开 PDF 后再试。",
      replyFailed: (message) => `AI 导学生成回答失败：${message}`,
    },
    status: {
      preparingScreenshot: "正在准备截图...",
    },
  },
  ja: {
    title: "AIチューター",
    currentDocument: (fileName) => `現在の文書: ${fileName}`,
    resetChat: "会話をリセット",
    emptyState: "質問を入力するか、スクリーンショットを添付して解説を受けてください。",
    generatingAnswer: "回答を生成中...",
    placeholder: "質問を入力してください。スクリーンショットも添付できます。",
    screenshotBadge: "スクリーンショット",
    attachScreenshot: "スクリーンショットを添付",
    replaceScreenshot: "スクリーンショットを差し替え",
    remove: "削除",
    send: "送信",
    sending: "送信中...",
    attachmentLabel: (name) => `添付画像: ${name}`,
    defaultAttachmentPrompt: "添付したスクリーンショットを学生にも分かりやすく説明してください。",
    notices: {
      openFileOrAttach: "PDFを開くか、スクリーンショットを添付してチューターに質問してください。",
      pdfOnlyForPageGrounded:
        "ページ参照型のチューターモードには PDF が必要ですが、スクリーンショットでの質問は可能です。",
      extractingText: "PDF テキストを抽出中です。スクリーンショットの質問はすぐに送れます。",
      scannedPdfFallback:
        "スキャン PDF でも利用できます。必要に応じて周辺ページを確認し、OCR も自動で試します。",
    },
    errors: {
      openFileOrAttach: "質問するには PDF を開くか、スクリーンショットを添付してください。",
      waitForPdfOrAttach:
        "PDF テキストの抽出がまだ完了していません。少し待つか、スクリーンショットを添付してください。",
      onlyImageFiles: "チューターには画像ファイルのみ添付できます。",
      noReadableScreenshotText: "スクリーンショットから読み取れるテキストが見つかりませんでした。",
      failedToReadScreenshot: (message) => `スクリーンショットを読み取れませんでした: ${message}`,
      pageInfoUnavailable: "ページ情報を取得できません。PDF を開き直して再試行してください。",
      replyFailed: (message) => `AIチューターの回答生成に失敗しました: ${message}`,
    },
    status: {
      preparingScreenshot: "スクリーンショットを準備中...",
    },
  },
  hi: {
    title: "AI ट्यूटर",
    currentDocument: (fileName) => `वर्तमान दस्तावेज़: ${fileName}`,
    resetChat: "चैट रीसेट करें",
    emptyState: "कोई सवाल लिखें, या समझाने के लिए स्क्रीनशॉट संलग्न करें।",
    generatingAnswer: "उत्तर बनाया जा रहा है...",
    placeholder: "अपना सवाल लिखें। आप स्क्रीनशॉट भी संलग्न कर सकते हैं।",
    screenshotBadge: "स्क्रीनशॉट",
    attachScreenshot: "स्क्रीनशॉट संलग्न करें",
    replaceScreenshot: "स्क्रीनशॉट बदलें",
    remove: "हटाएं",
    send: "भेजें",
    sending: "भेजा जा रहा है...",
    attachmentLabel: (name) => `संलग्न चित्र: ${name}`,
    defaultAttachmentPrompt: "संलग्न स्क्रीनशॉट को छात्र के लिए साफ़ और आसान तरीके से समझाइए।",
    notices: {
      openFileOrAttach: "ट्यूटर से पूछने के लिए PDF खोलें या स्क्रीनशॉट संलग्न करें।",
      pdfOnlyForPageGrounded:
        "पेज-आधारित ट्यूटर मोड के लिए PDF चाहिए, लेकिन आप स्क्रीनशॉट से सवाल पूछ सकते हैं।",
      extractingText: "PDF टेक्स्ट अभी निकाला जा रहा है। स्क्रीनशॉट वाले सवाल तुरंत भेजे जा सकते हैं।",
      scannedPdfFallback:
        "स्कैन किए गए PDF भी चलेंगे। जरूरत पड़ने पर ट्यूटर आसपास के पेज देखकर OCR भी आज़माएगा।",
    },
    errors: {
      openFileOrAttach: "ट्यूटर से पूछने से पहले PDF खोलें या स्क्रीनशॉट संलग्न करें।",
      waitForPdfOrAttach:
        "PDF टेक्स्ट एक्सट्रैक्शन अभी चल रहा है। थोड़ा इंतज़ार करें या स्क्रीनशॉट संलग्न करें।",
      onlyImageFiles: "ट्यूटर में केवल इमेज फ़ाइलें ही संलग्न की जा सकती हैं।",
      noReadableScreenshotText: "स्क्रीनशॉट में पढ़ने योग्य टेक्स्ट नहीं मिला।",
      failedToReadScreenshot: (message) => `स्क्रीनशॉट पढ़ा नहीं जा सका: ${message}`,
      pageInfoUnavailable: "पेज जानकारी उपलब्ध नहीं है। PDF दोबारा खोलकर फिर कोशिश करें।",
      replyFailed: (message) => `AI ट्यूटर जवाब नहीं बना सका: ${message}`,
    },
    status: {
      preparingScreenshot: "स्क्रीनशॉट तैयार किया जा रहा है...",
    },
  },
};

export function getTutorCopy(outputLanguage = "ko") {
  return TUTOR_COPY[outputLanguage] ?? TUTOR_COPY.ko;
}
