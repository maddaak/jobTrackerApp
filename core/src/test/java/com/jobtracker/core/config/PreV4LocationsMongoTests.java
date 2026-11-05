package com.jobtracker.core.config;

import com.jobtracker.core.model.JobDetail;
import com.jobtracker.core.model.Location;
import com.jobtracker.core.repository.JobDetailRepository;
import com.jobtracker.core.support.InMemoryMongo;
import org.bson.Document;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "app.convert-pre-v4-locations=true")
class PreV4LocationsMongoTests {

    @Autowired
    private PreV4Locations preV4Locations;

    @Autowired
    private MongoTemplate mongo;

    @Autowired
    private JobDetailRepository details;

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.mongodb.uri", InMemoryMongo::connectionString);
    }

    // Spring reads an enum by name, so one old name left in a market check would fail the whole document.
    @Test
    void aSavedMarketChecksOldLocationIsRenamedSoTheDocumentReads() throws Exception {
        details.deleteAll();
        long jobId = 1;
        for (String oldName : Location.PRE_V4_NAMES.keySet()) {
            Document basis = new Document("baseSalary", 150000).append("location", oldName);
            mongo.getCollection("job_details").insertOne(new Document("jobId", jobId++).append("ownerId", 1L)
                    .append("offer", new Document("baseSalary", 150000)
                            .append("marketCheck", new Document("verdict", "AT").append("searched", false)
                                    .append("basis", basis))));
        }

        preV4Locations.convert();

        jobId = 1;
        for (Location renamed : Location.PRE_V4_NAMES.values()) {
            JobDetail detail = details.findByJobId(jobId++).orElseThrow();
            assertThat(detail.getOffer().getMarketCheck().basis().location()).isEqualTo(renamed);
            assertThat(detail.getOffer().getMarketCheck().basis().city()).isEqualTo(Location.PRE_V4_CITY);
        }
        details.deleteAll();
    }
}
