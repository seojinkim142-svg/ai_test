import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function exportElementToPdf(element, { filename = "summary.pdf", margin = 10 } = {}) {
  if (!element) throw new Error("내보낼 요소가 없습니다.");

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: null, // keep existing styles
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

export async function exportPagedElementToPdf(
  container,
  { filename = "mock-exam.pdf", margin = 0, pageSelector = ".mock-exam-page", background = "#ffffff" } = {}
) {
  if (!container) throw new Error("내보낼 요소가 없습니다.");
  const pages = Array.from(container.querySelectorAll(pageSelector));
  if (pages.length === 0) {
    return exportElementToPdf(container, { filename, margin });
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      backgroundColor: background,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const scale = Math.min(
      (pageWidth - margin * 2) / canvas.width,
      (pageHeight - margin * 2) / canvas.height
    );
    const imgWidth = canvas.width * scale;
    const imgHeight = canvas.height * scale;
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
  }

  pdf.save(filename);
}
