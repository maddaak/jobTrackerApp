package com.jobtracker.core.dto;

// One cap per kind of field a caller sends, so a link or a note has the same limit everywhere. A job's
// description, notes and rounds share one Mongo document, which stops saving past 16MB.
public final class Limits {

    public static final int SHORT_TEXT = 255;
    public static final int URL = 2048;
    // The bff takes a pasted description up to this long, and notes get the same room.
    public static final int LONG_TEXT = 50_000;
    // Well above the 72 bytes a password can be, so a longer one is refused by the policy's own message.
    public static final int PASSWORD = 200;
    public static final int LIST = 50;

    private Limits() {
    }
}
