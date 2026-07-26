package com.jobtracker.core.service;

import com.jobtracker.core.exception.UnsupportedResumeTypeException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ResumeTextExtractorTests {

    private final ResumeTextExtractor extractor = new ResumeTextExtractor();

    @Test
    void extractsPlainText() {
        String text = extractor.extract("text/plain", "Experienced backend engineer.".getBytes());

        assertThat(text).isEqualTo("Experienced backend engineer.");
    }

    @Test
    void extractsPdfText() throws Exception {
        byte[] pdfBytes = buildPdf("Experienced backend engineer.");

        String text = extractor.extract("application/pdf", pdfBytes);

        assertThat(text).contains("Experienced backend engineer.");
    }

    @Test
    void extractsDocxText() throws Exception {
        byte[] docxBytes = buildDocx("Experienced backend engineer.");

        String text = extractor.extract(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docxBytes);

        assertThat(text).contains("Experienced backend engineer.");
    }

    @Test
    void rejectsUnsupportedContentType() {
        assertThatThrownBy(() -> extractor.extract("application/octet-stream", new byte[] {1, 2, 3}))
                .isInstanceOf(UnsupportedResumeTypeException.class);
    }

    private byte[] buildPdf(String text) throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(25, 700);
                stream.showText(text);
                stream.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private byte[] buildDocx(String text) throws Exception {
        try (XWPFDocument document = new XWPFDocument()) {
            XWPFParagraph paragraph = document.createParagraph();
            XWPFRun run = paragraph.createRun();
            run.setText(text);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.write(out);
            return out.toByteArray();
        }
    }
}
