package com.jobtracker.core.controller;

import com.jayway.jsonpath.JsonPath;
import com.jobtracker.core.model.User;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.repository.UserRepository;
import com.jobtracker.core.support.InMemoryMongo;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OfferControllerTests {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INTERNAL_TOKEN_VALUE = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository users;

    @Autowired
    private JobDetailRepository jobDetails;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    // Mongo outlives the Postgres rollback, so a reused job id would collide with a stale document.
    @BeforeEach
    void clearDocuments() {
        jobDetails.deleteAll();
    }

    private Long createUser(String username) {
        return users.save(new User(username, "hash")).getId();
    }

    private Long createJob(Long ownerId, String company) throws Exception {
        String body = mockMvc.perform(post("/jobs")
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId)
                        .contentType("application/json")
                        .content("{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(body, "$.id")).longValue();
    }

    private void moveTo(Long ownerId, Long jobId, String stage) throws Exception {
        mockMvc.perform(patch("/jobs/" + jobId)
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId)
                        .contentType("application/json")
                        .content("{\"company\":\"Acme\",\"role\":\"Engineer\",\"sourceCategory\":\"SELF_APPLIED\","
                                + "\"currentStage\":\"" + stage + "\",\"outcome\":\"ACTIVE\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions putOffer(Long ownerId, Long jobId, String json) throws Exception {
        return mockMvc.perform(put("/jobs/" + jobId + "/offer")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content(json));
    }

    @Test
    void anOfferIsRefusedForAJobThatHasNotReachedTheOfferStage() throws Exception {
        Long ownerId = createUser("offer-refused");
        Long jobId = createJob(ownerId, "Acme");

        putOffer(ownerId, jobId, "{\"baseSalary\":150000}").andExpect(status().isConflict());
    }

    @Test
    void aSavedOfferIsListedWithItsRecurringTotal() throws Exception {
        Long ownerId = createUser("offer-saved");
        Long offerJob = createJob(ownerId, "Acme");
        createJob(ownerId, "Globex");
        moveTo(ownerId, offerJob, "OFFER_STAGE");

        // 10% of base, and a $100,000 grant vesting 5/15/40/40 over four years: $25,000 a year on average.
        putOffer(ownerId, offerJob, "{\"offerTitle\":\" Engineer II \",\"baseSalary\":150000,\"bonusPercent\":10,\"equityGrant\":100000,"
                + "\"vestingYears\":4,\"vestingSchedule\":[5,15,40,40],\"signOnByYear\":[20000,10000],"
                + "\"decisionDeadline\":\"2026-11-01\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.offerTitle").value("Engineer II"))
                .andExpect(jsonPath("$.annualBonus").value(15000))
                .andExpect(jsonPath("$.bonusPercent").value(10.0))
                .andExpect(jsonPath("$.equityByYear", contains(5000, 15000, 40000, 40000)))
                .andExpect(jsonPath("$.equityPerYear").value(25000))
                .andExpect(jsonPath("$.compByYear", contains(190000, 190000, 205000, 205000)))
                .andExpect(jsonPath("$.averagePerYear").value(197500))
                .andExpect(jsonPath("$.averagedOverYears").value(4));

        mockMvc.perform(get("/offers")
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].company").value("Acme"))
                .andExpect(jsonPath("$[0].signOnByYear", contains(20000, 10000)))
                .andExpect(jsonPath("$[0].decisionDeadline").value("2026-11-01"));
    }

    // Most public-company letters give a share count; the grant is valued at the price entered.
    @Test
    void equityGivenInSharesIsValuedAtTheSharePrice() throws Exception {
        Long ownerId = createUser("offer-shares");
        Long offerJob = createJob(ownerId, "Acme");
        moveTo(ownerId, offerJob, "OFFER_STAGE");

        putOffer(ownerId, offerJob, "{\"baseSalary\":185000,\"equityShares\":1200,\"sharePrice\":185.0,"
                + "\"vestingYears\":4,\"vestingSchedule\":[5,15,40,40],\"signOnByYear\":[60000,45000]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.equityGrant").value(222000))
                .andExpect(jsonPath("$.equityShares").value(1200))
                .andExpect(jsonPath("$.equitySharesByYear", contains(60, 180, 480, 480)))
                .andExpect(jsonPath("$.compByYear", contains(256100, 263300, 273800, 273800)));

        putOffer(ownerId, offerJob, "{\"baseSalary\":185000,\"equityShares\":1200,\"sharePrice\":185.0,"
                + "\"priceGrowthPercent\":15,\"vestingYears\":4,\"vestingSchedule\":[5,15,40,40]}")
                .andExpect(jsonPath("$.priceGrowthPercent").value(15.0))
                .andExpect(jsonPath("$.equityProjectedByYear", contains(11100, 38295, 117437, 135053)))
                .andExpect(jsonPath("$.compByYear", contains(196100, 218300, 273800, 273800)));
        // The letter's own counts, a share off the split in years 1 and 4.
        putOffer(ownerId, offerJob, "{\"equityShares\":1200,\"sharePrice\":185.0,\"vestingYears\":4,"
                + "\"vestingSchedule\":[5,15,40,40],\"vestedShares\":[61,180,480,479]}")
                .andExpect(jsonPath("$.vestedShares", contains(61, 180, 480, 479)))
                .andExpect(jsonPath("$.equitySharesByYear", contains(61, 180, 480, 479)));
        putOffer(ownerId, offerJob, "{\"equityShares\":1200,\"sharePrice\":185.0,\"vestingYears\":4,\"vestedShares\":[1,2,3,4]}")
                .andExpect(status().isBadRequest());
        putOffer(ownerId, offerJob, "{\"equityShares\":10,\"sharePrice\":5.0,\"vestingYears\":4,\"priceGrowthPercent\":150}")
                .andExpect(status().isBadRequest());
        putOffer(ownerId, offerJob, "{\"equityShares\":1200,\"vestingYears\":4}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("share price")));
        putOffer(ownerId, offerJob, "{\"signOnByYear\":[-5]}").andExpect(status().isBadRequest());
    }

    @Test
    void aJobJustMovedToTheOfferStageIsListedBeforeAnyDetailsAreRecorded() throws Exception {
        Long ownerId = createUser("offer-empty");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");

        mockMvc.perform(get("/offers")
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].averagePerYear").doesNotExist());
    }

    // A one-time sign-on spread over the other offer's four years, not counted as a full year's pay.
    @Test
    void everyOfferIsAveragedOverTheLongestSpanAmongThem() throws Exception {
        Long ownerId = createUser("offer-span");
        Long granted = createJob(ownerId, "Acme");
        Long cashOnly = createJob(ownerId, "Globex");
        moveTo(ownerId, granted, "OFFER_STAGE");
        moveTo(ownerId, cashOnly, "OFFER_STAGE");

        putOffer(ownerId, cashOnly, "{\"baseSalary\":200000,\"signOnBonus\":40000}")
                .andExpect(jsonPath("$.signOnBonus").value(40000))
                .andExpect(jsonPath("$.signOnPaidByYear", contains(40000)))
                .andExpect(jsonPath("$.averagePerYear").value(240000))
                .andExpect(jsonPath("$.averagedOverYears").value(1));
        putOffer(ownerId, granted, "{\"baseSalary\":150000,\"equityGrant\":100000,\"vestingYears\":4}")
                .andExpect(jsonPath("$.averagePerYear").value(175000));

        mockMvc.perform(get("/offers")
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId))
                .andExpect(jsonPath("$[*].averagedOverYears", contains(4, 4)))
                .andExpect(jsonPath("$[*].averagePerYear", containsInAnyOrder(175000, 210000)));
    }

    @Test
    void aNegativeAmountIsRejected() throws Exception {
        Long ownerId = createUser("offer-negative");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");

        putOffer(ownerId, jobId, "{\"baseSalary\":-1}").andExpect(status().isBadRequest());
    }

    @Test
    void refusesAnOfferThatContradictsItself() throws Exception {
        Long ownerId = createUser("offer-contradicts");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");

        for (String body : List.of(
                "{\"bonusAmount\":15000,\"bonusPercent\":10}",
                "{\"equityGrant\":100000}",
                "{\"equityGrant\":100000,\"vestingYears\":0}",
                "{\"equityGrant\":100000,\"vestingYears\":4,\"vestingSchedule\":[25,25,25]}",
                "{\"equityGrant\":100000,\"vestingYears\":4,\"vestingSchedule\":[10,10,10,10]}",
                "{\"equityGrant\":100000,\"vestingYears\":2,\"vestingSchedule\":[-10,110]}")) {
            putOffer(ownerId, jobId, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").isNotEmpty());
        }
    }

    private ResultActions putMarketCheck(Long ownerId, Long jobId, String verdict) throws Exception {
        return mockMvc.perform(put("/jobs/" + jobId + "/offer/market-check")
                .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                .header("X-User-Id", ownerId)
                .contentType("application/json")
                .content("{\"verdict\":\"" + verdict + "\",\"typicalLow\":180000,\"typicalHigh\":220000,"
                        + "\"summary\":\"Surveys put it higher.\",\"negotiationPoints\":[\"Ask for more base.\"],"
                        + "\"searched\":true,\"sources\":[{\"title\":\"Pay data\",\"url\":\"https://pay.example/a\"}]}"));
    }

    // Kept through an edit, since it was paid for, but flagged once it describes different numbers.
    @Test
    void aMarketCheckIsKeptAndMarkedOutOfDateOnlyWhenWhatItPricedChanges() throws Exception {
        Long ownerId = createUser("offer-market");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");
        putOffer(ownerId, jobId, "{\"baseSalary\":150000}");

        putMarketCheck(ownerId, jobId, "below")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.baseSalary").value(150000))
                .andExpect(jsonPath("$.marketCheck.verdict").value("below"))
                .andExpect(jsonPath("$.marketCheck.sources[0].url").value("https://pay.example/a"))
                .andExpect(jsonPath("$.marketCheck.checkedAt").exists())
                .andExpect(jsonPath("$.marketCheckStale").value(false));

        putOffer(ownerId, jobId, "{\"baseSalary\":150000,\"notes\":\"great team\"}")
                .andExpect(jsonPath("$.marketCheck.verdict").value("below"))
                .andExpect(jsonPath("$.marketCheckStale").value(false));
        putOffer(ownerId, jobId, "{\"baseSalary\":200000}")
                .andExpect(jsonPath("$.marketCheck.verdict").value("below"))
                .andExpect(jsonPath("$.marketCheckStale").value(true));
        putOffer(ownerId, jobId, "{\"baseSalary\":150000,\"offerTitle\":\"Engineer II\"}")
                .andExpect(jsonPath("$.marketCheckStale").value(true));
    }

    @Test
    void aMarketCheckCanBeRemoved() throws Exception {
        Long ownerId = createUser("offer-market-removed");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");
        putOffer(ownerId, jobId, "{\"baseSalary\":150000}");
        putMarketCheck(ownerId, jobId, "below");

        mockMvc.perform(delete("/jobs/" + jobId + "/offer/market-check")
                        .header(INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_VALUE)
                        .header("X-User-Id", ownerId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.marketCheck").doesNotExist())
                .andExpect(jsonPath("$.baseSalary").value(150000));
    }

    @Test
    void aMarketCheckIsRefusedWhereThereIsNoOfferOrNoUsableVerdict() throws Exception {
        Long ownerId = createUser("offer-market-refused");
        Long jobId = createJob(ownerId, "Acme");

        putMarketCheck(ownerId, jobId, "below").andExpect(status().isConflict());
        moveTo(ownerId, jobId, "OFFER_STAGE");
        putMarketCheck(ownerId, jobId, "maybe").andExpect(status().isBadRequest());
        // An offer with nothing recorded yet can still be checked: it says what the role pays.
        putMarketCheck(ownerId, jobId, "unclear").andExpect(status().isOk());
    }

    @Test
    void anotherUsersJobIsNotFound() throws Exception {
        Long ownerId = createUser("offer-owner");
        Long jobId = createJob(ownerId, "Acme");
        moveTo(ownerId, jobId, "OFFER_STAGE");
        Long stranger = createUser("offer-stranger");

        putOffer(stranger, jobId, "{\"baseSalary\":1}").andExpect(status().isNotFound());
    }
}
