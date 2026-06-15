import { useCallback } from "react";
import { extractPdfPageTexts } from "../utils/pdf";
import { detectSupportedDocumentKind, isPdfDocumentKind } from "../utils/document";
import {
  normalizeTutorRequestPayload,
  buildTutorHistoryMessageContent,
  buildTutorImageEvidenceBlock,
  buildTutorPageCandidates,
  extractTutorSectionCandidates,
  extractTutorProblemTokenCandidates,
  detectTutorSectionPageRange,
  resolveTutorReplyText,
} from "../utils/tutorHelpers";
import {
  useTutorStore,
  useUiStore,
} from "../stores";

export function useTutorActions({
  user,
  selectedFileId,
  extractedText,
  file,
  isLoadingText,
  outputLanguage,
  currentPage,
  pageInfo,
  previewText,
  selectedFolderId,
  folderTutorMode,
  tutorCopy,
  tutorRequestInFlightRef,
  tutorPageTextCacheRef,
  tutorSectionRangeCacheRef,
  summaryContextCacheRef,
  questionSourceTextCacheRef,
  persistTutorHistory,
  buildFolderTutorContext,
  recoverQuestionSourceText,
  getOpenAiService,
}) {
  const {
    tutorMessages, setTutorMessages,
    isTutorLoading, setIsTutorLoading,
    setTutorError,
  } = useTutorStore();

  const { setStatus } = useUiStore();

  const handleResetTutor = useCallback(() => {
    setTutorMessages([]);
    persistTutorHistory(selectedFileId, []);
    setTutorError("");
    setIsTutorLoading(false);
    tutorRequestInFlightRef.current = false;
  }, [persistTutorHistory, selectedFileId]);

  const handleSendTutorMessage = useCallback(
    (requestPayload) => {
      const { prompt, displayPrompt, attachmentFile } = normalizeTutorRequestPayload(requestPayload);
      const hasAttachment = Boolean(attachmentFile);
      const effectivePrompt =
        String(prompt || "").trim() ||
        (hasAttachment ? tutorCopy.defaultAttachmentPrompt : "");
      const effectiveDisplayPrompt = String(displayPrompt || effectivePrompt).trim();
      if ((!effectivePrompt && !hasAttachment) || isTutorLoading || tutorRequestInFlightRef.current) {
        return false;
      }

      // 폴더 모드: 폴더 전체 문서 컨텍스트로 튜터 실행
      if (folderTutorMode && selectedFolderId && selectedFolderId !== "all" && !hasAttachment) {
        tutorRequestInFlightRef.current = true;
        setTutorError("");
        setStatus("");
        setTutorMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: effectiveDisplayPrompt }]);
        setIsTutorLoading(true);
        void (async () => {
          try {
            const folderContext = await buildFolderTutorContext(selectedFolderId);
            if (!folderContext) {
              setTutorError("폴더 내 문서 텍스트를 가져오지 못했습니다. 각 문서를 먼저 열어 텍스트를 로드해주세요.");
              return;
            }
            const { generateTutorReply } = await getOpenAiService();
            const history = tutorMessages.slice(-8).map((msg) => ({ role: msg?.role, content: String(msg?.content || "").slice(0, 1200) })).filter((m) => m.role && m.content.trim());
            const reply = await generateTutorReply({ question: effectivePrompt, extractedText: folderContext, messages: history, outputLanguage });
            setTutorMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: reply }]);
          } catch (err) {
            setTutorError(`폴더 튜터 오류: ${err.message}`);
          } finally {
            setIsTutorLoading(false);
            tutorRequestInFlightRef.current = false;
          }
        })();
        return true;
      }

      const selectedKind = detectSupportedDocumentKind(file);
      const canUsePdfEvidence = Boolean(file && selectedFileId && isPdfDocumentKind(selectedKind));
      if (!canUsePdfEvidence && !hasAttachment) {
        setTutorError(tutorCopy.errors.openFileOrAttach);
        return false;
      }
      if (canUsePdfEvidence && isLoadingText && !hasAttachment) {
        setTutorError(tutorCopy.errors.waitForPdfOrAttach);
        return false;
      }

      const history = tutorMessages
        .slice(-8)
        .map((msg) => ({
          role: msg?.role,
          content: buildTutorHistoryMessageContent(msg).slice(0, 1200),
        }))
        .filter((msg) => msg.role && msg.content.trim());
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: effectiveDisplayPrompt,
        ...(hasAttachment && attachmentFile?.name
          ? {
              attachmentName: attachmentFile.name,
            }
          : {}),
      };

      tutorRequestInFlightRef.current = true;
      setTutorError("");
      setStatus("");
      setTutorMessages((prev) => [...prev, userMessage]);
      setIsTutorLoading(true);

      void (async () => {
        try {
          let attachmentEvidenceText = "";
          let attachmentHistoryText = "";
          let attachmentImageDataUrl = "";
          let attachmentMeta = null;

          if (hasAttachment) {
            try {
              const { buildVisionImageDataUrl, extractImageText, isTutorImageFile } = await import("../utils/imageOcr");
              if (!isTutorImageFile(attachmentFile)) {
                setTutorError(tutorCopy.errors.onlyImageFiles);
                setStatus("");
                return;
              }

              setStatus(tutorCopy.status.preparingScreenshot);
              const [imageResult, imageDataUrl] = await Promise.all([
                extractImageText(attachmentFile, {
                  ocrLang: "kor+eng",
                  maxLength: 18000,
                  onProgress: (message) => setStatus(String(message || "")),
                }),
                buildVisionImageDataUrl(attachmentFile),
              ]);
              attachmentImageDataUrl = String(imageDataUrl || "");
              attachmentHistoryText = String(imageResult?.text || "").slice(0, 900);
              attachmentEvidenceText = buildTutorImageEvidenceBlock({
                attachmentName: attachmentFile.name,
                attachmentType: attachmentFile.type,
                dimensions: imageResult,
                ocrText: imageResult?.text,
              });
              attachmentMeta = {
                attachmentName: attachmentFile.name,
                attachmentType: attachmentFile.type,
                attachmentText: attachmentHistoryText,
              };

              if (!attachmentEvidenceText && !canUsePdfEvidence) {
                setTutorError(tutorCopy.errors.noReadableScreenshotText);
                setStatus("");
                return;
              }
            } catch (err) {
              setTutorError(tutorCopy.errors.failedToReadScreenshot(err.message));
              setStatus("");
              return;
            }
          }

          let pdfEvidenceText = "";
          if (canUsePdfEvidence && !isLoadingText) {
            const summaryCacheKey = selectedFileId || file?.name || null;
            const docCacheKey = String(selectedFileId || file?.name || "").trim() || "__active__";
            let recoveredTutorDocText = [
              extractedText,
              previewText,
              summaryCacheKey ? summaryContextCacheRef.current.get(summaryCacheKey) : "",
              questionSourceTextCacheRef.current.get(`${docCacheKey}:full-doc`),
            ]
              .map((value) => String(value || "").trim())
              .find((value) => value.length >= 80) || "";
            const buildRecoveredPdfEvidence = async () => {
              if (recoveredTutorDocText.length < 80) {
                recoveredTutorDocText = String(
                  await recoverQuestionSourceText({
                    featureLabel: tutorCopy.title,
                    sourceText: recoveredTutorDocText,
                  })
                ).trim();
              }
              if (!recoveredTutorDocText) return "";
              return [
                "[RAW PDF EVIDENCE]",
                `- query: ${effectivePrompt}`,
                "- source: recovered_full_document_text",
                "",
                recoveredTutorDocText.slice(0, 180000),
              ].join("\n");
            };

            const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
            const requestedPages = buildTutorPageCandidates(effectivePrompt, totalPages);
            const sectionHints = extractTutorSectionCandidates(effectivePrompt);
            const problemHints = extractTutorProblemTokenCandidates(effectivePrompt);
            const targetTokens = [...new Set([...sectionHints, ...problemHints])];
            const primaryToken = targetTokens[0] || "";
            const shouldPreferRecoveredDocEvidence =
              !hasAttachment &&
              !requestedPages.length &&
              !targetTokens.length &&
              recoveredTutorDocText.length >= 80;

            if (shouldPreferRecoveredDocEvidence) {
              pdfEvidenceText = await buildRecoveredPdfEvidence();
            } else if (!totalPages) {
              pdfEvidenceText = await buildRecoveredPdfEvidence();
              if (!pdfEvidenceText && !hasAttachment) {
                setTutorError(tutorCopy.errors.pageInfoUnavailable);
                return;
              }
            } else {
            const tutorDocKey = String(selectedFileId || file?.name || "").trim();
            const currentKnownPage = Math.max(1, Number(currentPage || 1));
            const anchorPage = requestedPages.length
              ? requestedPages[0]
              : Math.max(1, Math.min(totalPages, currentKnownPage));

            const buildPageRange = (start, end, cap = 120) => {
              const lo = Math.max(1, Math.min(totalPages, Number.parseInt(start, 10) || 1));
              const hi = Math.max(lo, Math.min(totalPages, Number.parseInt(end, 10) || lo));
              const pages = [];
              for (let page = lo; page <= hi; page += 1) {
                pages.push(page);
                if (pages.length >= cap) break;
              }
              return pages;
            };
            const mergePages = (...lists) =>
              Array.from(
                new Set(
                  lists
                    .flat()
                    .map((page) => Number.parseInt(page, 10))
                    .filter((page) => Number.isFinite(page) && page > 0 && page <= totalPages)
                )
              ).sort((a, b) => a - b);
            const pageCacheKey = (pageNumber) => `${tutorDocKey}:${pageNumber}`;
            const loadPageEntries = async (pages, { useOcr = false, maxCharsPerPage = 5000 } = {}) => {
              const normalizedPages = mergePages(pages);
              if (!normalizedPages.length) return [];

              const missing = [];
              const entriesByPage = new Map();
              for (const pageNumber of normalizedPages) {
                const cached = tutorPageTextCacheRef.current.get(pageCacheKey(pageNumber));
                const shouldReloadForOcr =
                  useOcr &&
                  (!cached || !cached.ocrUsed || String(cached.text || "").trim().length < 220);
                if (!cached || !String(cached.text || "").trim() || shouldReloadForOcr) {
                  missing.push(pageNumber);
                  continue;
                }
                entriesByPage.set(pageNumber, {
                  pageNumber,
                  text: String(cached.text || "").trim(),
                  ocrUsed: Boolean(cached.ocrUsed),
                });
              }

              if (missing.length) {
                const fetched = await extractPdfPageTexts(file, missing, {
                  useOcr,
                  ocrLang: "kor+eng",
                  maxCharsPerPage,
                });
                for (const pageEntry of fetched?.pages || []) {
                  const pageNumber = Number.parseInt(pageEntry?.pageNumber, 10);
                  if (!Number.isFinite(pageNumber)) continue;
                  const text = String(pageEntry?.text || "").trim();
                  const payload = {
                    pageNumber,
                    text,
                    ocrUsed: Boolean(pageEntry?.ocrUsed),
                  };
                  if (text) {
                    tutorPageTextCacheRef.current.set(pageCacheKey(pageNumber), {
                      text,
                      ocrUsed: payload.ocrUsed,
                    });
                    entriesByPage.set(pageNumber, payload);
                  }
                }
              }

              return mergePages(normalizedPages)
                .map((pageNumber) => entriesByPage.get(pageNumber))
                .filter((entry) => entry && entry.text);
            };

            setStatus("Searching relevant PDF pages...");
            const narrowScanPages = buildPageRange(anchorPage - 20, anchorPage + 90, 130);
            const broadScanPages = buildPageRange(anchorPage - 70, anchorPage + 220, 260);

            let scannedEntries = await loadPageEntries(narrowScanPages, {
              useOcr: false,
              maxCharsPerPage: 4200,
            });

            let detectedRange =
              primaryToken && tutorDocKey
                ? tutorSectionRangeCacheRef.current.get(`${tutorDocKey}:${primaryToken}:${anchorPage}`) || null
                : null;

            if (!detectedRange && primaryToken) {
              detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
            }

            if (!detectedRange && primaryToken) {
              const broadEntries = await loadPageEntries(broadScanPages, {
                useOcr: false,
                maxCharsPerPage: 4200,
              });
              if (broadEntries.length > scannedEntries.length) scannedEntries = broadEntries;
              detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
            }

            if (!detectedRange && primaryToken) {
              const ocrProbePages = requestedPages.length
                ? mergePages(requestedPages, buildPageRange(anchorPage - 10, anchorPage + 30, 60))
                : buildPageRange(anchorPage - 12, anchorPage + 45, 70);
              const ocrEntries = await loadPageEntries(ocrProbePages, {
                useOcr: true,
                maxCharsPerPage: 4200,
              });
              detectedRange = detectTutorSectionPageRange(ocrEntries, primaryToken);
            }

            if (detectedRange && tutorDocKey && primaryToken) {
              tutorSectionRangeCacheRef.current.set(
                `${tutorDocKey}:${primaryToken}:${anchorPage}`,
                detectedRange
              );
            }

            let finalPages = [];
            if (detectedRange?.startPage && detectedRange?.endPage) {
              finalPages = buildPageRange(detectedRange.startPage - 1, detectedRange.endPage + 1, 120);
            } else if (requestedPages.length) {
              const firstRequested = requestedPages[0];
              const lastRequested = requestedPages[requestedPages.length - 1];
              finalPages = buildPageRange(
                firstRequested - 1,
                Math.max(lastRequested + 18, firstRequested + 12),
                120
              );
            } else {
              finalPages = buildPageRange(anchorPage - 3, anchorPage + 15, 40);
            }
            finalPages = mergePages(finalPages, requestedPages);

            const finalEntries = await loadPageEntries(finalPages, {
              useOcr: true,
              maxCharsPerPage: 5200,
            });
            if (!finalEntries.length) {
              pdfEvidenceText = await buildRecoveredPdfEvidence();
              if (!pdfEvidenceText && !attachmentEvidenceText) {
                setTutorError("No readable evidence was found on nearby PDF pages. Reopen the PDF and try again.");
                setStatus("");
                return;
              }
            } else {
              const loadedPages = finalEntries.map((entry) => entry.pageNumber);
              const tutorEvidence = finalEntries
                .map((entry) => `[p.${entry.pageNumber}]\n${entry.text}`)
                .join("\n\n")
                .slice(0, 180000);

              pdfEvidenceText = [
                "[RAW PDF EVIDENCE]",
                `- query: ${effectivePrompt}`,
                `- requested_pages: ${requestedPages.length ? requestedPages.join(", ") : "none"}`,
                `- requested_problem_or_section: ${primaryToken || "none"}`,
                detectedRange
                  ? `- detected_range: p.${detectedRange.startPage}-${detectedRange.endPage}`
                  : "- detected_range: not_found",
                `- loaded_pages: ${loadedPages.join(", ")}`,
                "",
                tutorEvidence,
              ].join("\n");
            }
          }
        }

          const tutorSourceText = [attachmentEvidenceText, pdfEvidenceText].filter(Boolean).join("\n\n");
          if (!tutorSourceText) {
            setTutorError("No readable study evidence was available for the tutor.");
            setStatus("");
            return;
          }

          try {
            const { generateTutorReply } = await getOpenAiService();
            const reply = await generateTutorReply({
              question: effectivePrompt,
              extractedText: tutorSourceText,
              messages: history,
              imageAttachment: attachmentImageDataUrl
                ? {
                    dataUrl: attachmentImageDataUrl,
                    name: attachmentFile?.name || "",
                    mimeType: attachmentFile?.type || "",
                  }
                : null,
              outputLanguage,
            });
            const safeReply = resolveTutorReplyText(reply, {
              question: effectivePrompt,
              rawEvidenceText: tutorSourceText,
            });
            setTutorMessages((prev) => {
              if (!attachmentMeta) {
                return [...prev, { id: crypto.randomUUID(), role: "assistant", content: safeReply }];
              }
              const next = [...prev];
              const lastUserIndex = [...next]
                .map((message, index) => ({ message, index }))
                .reverse()
                .find((entry) => entry.message?.role === "user" && entry.message?.content === effectiveDisplayPrompt)?.index;
              if (Number.isInteger(lastUserIndex) && lastUserIndex >= 0) {
                next[lastUserIndex] = {
                  ...next[lastUserIndex],
                  ...attachmentMeta,
                };
              }
              next.push({ id: crypto.randomUUID(), role: "assistant", content: safeReply });
              return next;
            });
          } catch (err) {
            setTutorError(tutorCopy.errors.replyFailed(err.message));
          }
        } catch (err) {
          console.error("Tutor request pipeline failed", err);
          setTutorError(
            tutorCopy.errors.replyFailed(
              String(err?.message || "Unknown tutor pipeline error")
            )
          );
        } finally {
          tutorRequestInFlightRef.current = false;
          setIsTutorLoading(false);
          setStatus("");
        }
      })();

      return true;
    },
    [
      currentPage,
      extractedText,
      file,
      getOpenAiService,
      isLoadingText,
      isTutorLoading,
      outputLanguage,
      pageInfo?.total,
      pageInfo?.used,
      previewText,
      recoverQuestionSourceText,
      selectedFileId,
      tutorCopy,
      tutorMessages,
    ]
  );

  return {
    handleResetTutor,
    handleSendTutorMessage,
  };
}
