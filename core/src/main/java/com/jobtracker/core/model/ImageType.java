package com.jobtracker.core.model;

// Magic bytes, never the caller's filename or declared type. SVG is refused: it can carry script.
public enum ImageType {

    PNG("image/png", new int[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
    JPEG("image/jpeg", new int[] { 0xFF, 0xD8, 0xFF }),
    WEBP("image/webp", new int[] { 0x52, 0x49, 0x46, 0x46 });

    private final String contentType;
    private final int[] magic;

    ImageType(String contentType, int[] magic) {
        this.contentType = contentType;
        this.magic = magic;
    }

    public String getContentType() {
        return contentType;
    }

    public static ImageType detect(byte[] data) {
        for (ImageType type : values()) {
            if (type.matches(data)) {
                return type;
            }
        }
        return null;
    }

    private boolean matches(byte[] data) {
        if (data == null || data.length < magic.length) {
            return false;
        }
        for (int i = 0; i < magic.length; i++) {
            if ((data[i] & 0xFF) != magic[i]) {
                return false;
            }
        }
        // RIFF alone is any RIFF container, so WEBP needs its second marker to rule out audio.
        return this != WEBP || (data.length >= 12 && new String(data, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP"));
    }
}
