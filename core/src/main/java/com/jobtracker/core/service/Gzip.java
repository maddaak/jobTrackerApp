package com.jobtracker.core.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

// Shared gzip helpers for the large text blobs (resume text, job descriptions) that are stored
// compressed in Mongo. Kept in one place so the two services that persist those blobs cannot
// drift apart on the wire format.
final class Gzip {

    private Gzip() {
    }

    static byte[] compress(String text) {
        String safe = text == null ? "" : text;
        ByteArrayOutputStream byteStream = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(byteStream)) {
            gzip.write(safe.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return byteStream.toByteArray();
    }

    static String decompress(byte[] compressed) {
        if (compressed == null || compressed.length == 0) {
            return "";
        }
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
            return new String(gzip.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            // Corrupt stored data is a server fault, not a bad upload. A non-UncheckedIOException
            // routes to the catch-all 500 instead of the 422 upload-read handler.
            throw new IllegalStateException("stored compressed text could not be read", e);
        }
    }
}
