package com.jobtracker.core.service;

import com.jobtracker.core.exception.UnsupportedResumeTypeException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

@Component
public class ResumeTextExtractor {

    private static final String TEXT = "text/plain";

    // Route by magic bytes, not the spoofable Content-Type, so a forged header can't reach the parsers.
    public String extract(String contentType, byte[] bytes) {
        try {
            if (looksLikePdf(bytes)) {
                return extractPdf(bytes);
            }
            if (looksLikeZip(bytes)) {
                return extractDocx(bytes);
            }
            if (TEXT.equals(normalize(contentType))) {
                return new String(bytes, StandardCharsets.UTF_8);
            }
            throw new UnsupportedResumeTypeException(contentType);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    // %PDF
    private boolean looksLikePdf(byte[] bytes) {
        return bytes.length >= 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F';
    }

    // PK zip local-file header (0x50 0x4B) that a .docx is packaged as.
    private boolean looksLikeZip(byte[] bytes) {
        return bytes.length >= 2 && bytes[0] == 0x50 && bytes[1] == 0x4B;
    }

    private String normalize(String contentType) {
        return contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase();
    }

    private String extractPdf(byte[] bytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(document);
        } catch (RuntimeException e) {
            // Bad upload, not a server fault: route to the 422 path, not a 500.
            throw new IOException("not a valid PDF document", e);
        }
    }

    private String extractDocx(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
                XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            return extractor.getText();
        } catch (RuntimeException e) {
            // POI throws a RuntimeException for a zip that isn't a valid .docx: 422, not a 500.
            throw new IOException("not a valid .docx document", e);
        }
    }
}
