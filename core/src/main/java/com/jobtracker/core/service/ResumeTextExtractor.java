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

    private static final String PDF = "application/pdf";
    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String TEXT = "text/plain";

    public String extract(String contentType, byte[] bytes) {
        try {
            return switch (normalize(contentType)) {
                case PDF -> extractPdf(bytes);
                case DOCX -> extractDocx(bytes);
                case TEXT -> new String(bytes, StandardCharsets.UTF_8);
                default -> throw new UnsupportedResumeTypeException(contentType);
            };
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private String normalize(String contentType) {
        return contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase();
    }

    private String extractPdf(byte[] bytes) throws IOException {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            return new PDFTextStripper().getText(document);
        }
    }

    private String extractDocx(byte[] bytes) throws IOException {
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(bytes));
                XWPFWordExtractor extractor = new XWPFWordExtractor(document)) {
            return extractor.getText();
        }
    }
}
