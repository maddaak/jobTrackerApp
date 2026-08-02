package com.jobtracker.core.support;

import de.bwaldvogel.mongo.MongoServer;
import de.bwaldvogel.mongo.backend.memory.MemoryBackend;

import java.net.InetSocketAddress;

// Pure-Java in-memory MongoDB (no mongod, no Docker) so a @SpringBootTest can run the real Mongo
// delete path. Without it, that path hangs on the driver's 30s server-selection timeout.
public final class InMemoryMongo {
    private static final MongoServer SERVER = new MongoServer(new MemoryBackend());
    private static final InetSocketAddress ADDRESS = SERVER.bind();

    private InMemoryMongo() {}

    public static String connectionString() {
        return "mongodb://" + ADDRESS.getHostName() + ":" + ADDRESS.getPort() + "/testdb";
    }
}
