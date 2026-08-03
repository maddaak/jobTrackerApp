package com.jobtracker.core.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

// Shared gzip helpers so the services storing text blobs in Mongo can't drift on wire format.
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
            // Not UncheckedIOException: corrupt stored data is a 500, not the 422 upload-read path.
            throw new IllegalStateException("stored compressed text could not be read", e);
        }
    }
}
