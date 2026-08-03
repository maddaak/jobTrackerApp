package com.jobtracker.core.support;

import de.bwaldvogel.mongo.MongoServer;
import de.bwaldvogel.mongo.backend.memory.MemoryBackend;

import java.net.InetSocketAddress;

// In-memory MongoDB so tests exercise the real Mongo path without hanging on the 30s server-selection timeout.
public final class InMemoryMongo {
    private static final MongoServer SERVER = new MongoServer(new MemoryBackend());
    private static final InetSocketAddress ADDRESS = SERVER.bind();

    private InMemoryMongo() {}

    public static String connectionString() {
        return "mongodb://" + ADDRESS.getHostName() + ":" + ADDRESS.getPort() + "/testdb";
    }
}
