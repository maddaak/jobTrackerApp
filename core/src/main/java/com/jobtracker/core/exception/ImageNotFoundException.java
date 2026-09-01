package com.jobtracker.core.exception;

public class ImageNotFoundException extends RuntimeException {
    public ImageNotFoundException() {
        super("image not found");
    }
}
