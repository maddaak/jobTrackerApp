package com.jobtracker.core.exception;

public class AiDailyLimitException extends RuntimeException {
    public AiDailyLimitException(int dailyLimit) {
        super("the daily limit of " + dailyLimit + (dailyLimit == 1 ? " AI call" : " AI calls")
                + " is used up; it resets at midnight UTC (AI_DAILY_LIMIT in .env)");
    }
}
