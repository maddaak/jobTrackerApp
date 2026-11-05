package com.jobtracker.core.dto;

import com.jobtracker.core.model.AccountAiResult;
import com.jobtracker.core.model.InterviewPhase;
import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.JobImage;
import com.jobtracker.core.model.Outcome;
import com.jobtracker.core.model.ReminderSettings;
import com.jobtracker.core.model.Resume;
import com.jobtracker.core.model.SourceCategory;
import com.jobtracker.core.model.Stage;
import java.time.Instant;
import java.util.List;

// Everything one account owns, in one file. No password and no sent-reminder log: a restore goes into an
// account that already has its own password, and old reminders shouldn't block or repeat new ones.
// aiResults holds the company briefs and Insights; a job's own AI results travel inside its detail. Null in a
// backup made before they existed.
public record Backup(String format, int version, Instant exportedAt, List<Job> jobs, List<Resume> resumes,
        ReminderSettings reminderSettings, List<AccountAiResult> aiResults) {

    public static final String FORMAT = "job-tracker-backup";
    public static final int VERSION = 1;

    // The jobs-table row, spelled out because the entity also carries its owner; id is the old one, kept so
    // links and images can be pointed at the job's new id. location is text so a pre-V4 backup's names still read.
    // season is the season's name, null in a backup made before seasons.
    public record Job(Long id, String company, String role, SourceCategory sourceCategory, String url,
            String location, String city, Integer compMin, Integer compMax, Stage currentStage,
            InterviewPhase interviewPhase, Outcome outcome, Instant createdAt, JobDetail detail,
            List<JobImage> images, String season) {
    }
}
