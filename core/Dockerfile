FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -DskipTests

# Alpine rather than Ubuntu: a far smaller base, and its wget does the healthcheck with nothing installed.
FROM eclipse-temurin:25-jre-alpine
RUN adduser -D -u 10001 app
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
USER app
# Sized for one user: idle memory is handed back every 30s, and the 40% cap still fits a 200MB restore.
ENV JAVA_TOOL_OPTIONS="-XX:+UseG1GC -XX:G1PeriodicGCInterval=30000 -XX:TieredStopAtLevel=1 -Xss512k -XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=30 -XX:MaxRAMPercentage=40"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["java", "-jar", "app.jar"]
