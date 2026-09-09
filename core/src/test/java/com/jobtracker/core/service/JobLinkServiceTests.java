package com.jobtracker.core.service;

import com.jobtracker.core.dto.JobLinkResponse;
import com.jobtracker.core.exception.InvalidJobLinkException;
import com.jobtracker.core.exception.JobNotFoundException;
import com.jobtracker.core.model.*;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class JobLinkServiceTests {

    private static final Long OWNER = 1L;
    private static final Long CLOSED_ROLE = 10L;
    private static final Long NEW_ROLE = 11L;

    @Mock
    private JobRepository jobs;

    @Mock
    private JobDetailRepository jobDetails;

    private JobLinkService jobLinkService;

    // Stands in for the collection so a read sees what a save wrote.
    private final Map<Long, JobDetail> stored = new HashMap<>();

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        jobLinkService = new JobLinkService(jobs, jobDetails);
        stored.clear();

        User owner = new User("alice", "hash");
        ReflectionTestUtils.setField(owner, "id", OWNER);
        stubJob(owner, CLOSED_ROLE, "Globex", "Detection Engineer");
        stubJob(owner, NEW_ROLE, "Globex", "Security Engineer II");

        when(jobDetails.findByJobId(anyLong())).thenAnswer(i -> Optional.ofNullable(stored.get(i.<Long>getArgument(0))));
        when(jobDetails.findByJobIdAndOwnerId(anyLong(), anyLong())).thenAnswer(i -> {
            JobDetail detail = stored.get(i.<Long>getArgument(0));
            Long ownerId = detail == null ? null : (Long) ReflectionTestUtils.getField(detail, "ownerId");
            return i.<Long>getArgument(1).equals(ownerId) ? Optional.of(detail) : Optional.empty();
        });
        when(jobDetails.save(any(JobDetail.class))).thenAnswer(i -> {
            JobDetail detail = i.getArgument(0);
            stored.put(detail.getJobId(), detail);
            return detail;
        });
    }

    private Job stubJob(User owner, Long id, String company, String role) {
        Job job = new Job(company, role, owner, SourceCategory.SELF_APPLIED, null, null, null, null);
        ReflectionTestUtils.setField(job, "id", id);
        when(jobs.findByIdAndOwnerId(id, OWNER)).thenReturn(Optional.of(job));
        when(jobs.findAllById(argThat(ids -> ids != null && contains(ids, id)))).thenReturn(List.of(job));
        return job;
    }

    private static boolean contains(Iterable<Long> ids, Long id) {
        for (Long candidate : ids) {
            if (id.equals(candidate)) {
                return true;
            }
        }
        return false;
    }

    @Test
    void linkWritesBothEndsWithInverseRelations() {
        List<JobLinkResponse> links = jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.REPLACED_BY);

        assertThat(links).singleElement().satisfies(link -> {
            assertThat(link.jobId()).isEqualTo(NEW_ROLE);
            assertThat(link.company()).isEqualTo("Globex");
            assertThat(link.role()).isEqualTo("Security Engineer II");
            assertThat(link.relation()).isEqualTo(JobRelation.REPLACED_BY);
        });
        // The other row must state the link from its own side.
        assertThat(stored.get(NEW_ROLE).getRelatedJobs()).singleElement().satisfies(link -> {
            assertThat(link.getJobId()).isEqualTo(CLOSED_ROLE);
            assertThat(link.getRelation()).isEqualTo(JobRelation.REPLACES);
        });
    }

    @Test
    void relinkingReplacesTheRelationRatherThanAddingASecondEdge() {
        jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.RELATED);
        jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.REPLACED_BY);

        assertThat(stored.get(CLOSED_ROLE).getRelatedJobs()).singleElement()
                .satisfies(link -> assertThat(link.getRelation()).isEqualTo(JobRelation.REPLACED_BY));
        assertThat(stored.get(NEW_ROLE).getRelatedJobs()).singleElement()
                .satisfies(link -> assertThat(link.getRelation()).isEqualTo(JobRelation.REPLACES));
    }

    @Test
    void unlinkDropsBothEnds() {
        jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.REPLACED_BY);

        assertThat(jobLinkService.unlink(OWNER, CLOSED_ROLE, NEW_ROLE)).isEmpty();
        assertThat(stored.get(NEW_ROLE).getRelatedJobs()).isEmpty();
    }

    @Test
    void unlinkLeavesADocumentTheCallerDoesNotOwnUntouched() {
        JobDetail theirs = new JobDetail(99L, 2L, new byte[0], "");
        theirs.linkTo(CLOSED_ROLE, JobRelation.RELATED);
        stored.put(99L, theirs);

        jobLinkService.unlink(OWNER, CLOSED_ROLE, 99L);

        assertThat(theirs.getRelatedJobs()).hasSize(1);
        verify(jobDetails, never()).save(theirs);
    }

    @Test
    void aFailedInverseWritePutsBackTheRelationItReplaced() {
        jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.RELATED);
        doThrow(new RuntimeException("mongo unavailable")).when(jobDetails)
                .save(argThat(detail -> detail != null && NEW_ROLE.equals(detail.getJobId())));

        assertThatThrownBy(() -> jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.REPLACED_BY))
                .isInstanceOf(RuntimeException.class);

        // Rolling back to "no link" would be the one-sided state the rollback exists to prevent.
        assertThat(stored.get(CLOSED_ROLE).getRelatedJobs()).singleElement()
                .satisfies(link -> assertThat(link.getRelation()).isEqualTo(JobRelation.RELATED));
    }

    @Test
    void everyRelationHasAnInverseThatRoundTrips() {
        for (JobRelation relation : JobRelation.values()) {
            assertThat(relation.inverse().inverse()).isEqualTo(relation);
        }
    }

    @Test
    void selfLinkIsRejected() {
        assertThatThrownBy(() -> jobLinkService.link(OWNER, CLOSED_ROLE, CLOSED_ROLE, JobRelation.RELATED))
                .isInstanceOf(InvalidJobLinkException.class);
        assertThat(stored).isEmpty();
    }

    @Test
    void linkingAJobTheCallerDoesNotOwnIsRejected() {
        when(jobs.findByIdAndOwnerId(99L, OWNER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobLinkService.link(OWNER, CLOSED_ROLE, 99L, JobRelation.RELATED))
                .isInstanceOf(JobNotFoundException.class);
        // Rejected before either end is written.
        assertThat(stored).isEmpty();
    }

    @Test
    void removeLinksToDropsInboundEdgesButNotTheSurvivingJob() {
        jobLinkService.link(OWNER, CLOSED_ROLE, NEW_ROLE, JobRelation.REPLACED_BY);
        when(jobDetails.findByOwnerIdAndRelatedJobsJobId(OWNER, CLOSED_ROLE))
                .thenReturn(List.of(stored.get(NEW_ROLE)));

        jobLinkService.removeLinksTo(OWNER, CLOSED_ROLE);

        assertThat(stored.get(NEW_ROLE).getRelatedJobs()).isEmpty();
        verify(jobDetails, never()).deleteByJobId(anyLong());
    }

    @Test
    void resolveDropsAnEdgePointingAtAJobThatNoLongerExists() {
        List<JobLink> links = List.of(new JobLink(NEW_ROLE, JobRelation.REPLACED_BY), new JobLink(404L, JobRelation.RELATED));

        assertThat(jobLinkService.resolve(links, Map.of()))
                .as("no target resolves, so nothing is rendered")
                .isEmpty();
    }
}
