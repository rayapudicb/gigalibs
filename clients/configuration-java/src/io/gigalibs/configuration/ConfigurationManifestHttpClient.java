package io.gigalibs.configuration;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.OptionalLong;

/**
 * Java 11 HTTP transport for the strict Configuration Studio runtime-manifest boundary.
 *
 * <p>Non-loopback requests require HTTPS and the JVM's normal trust and hostname verification. Redirects
 * are never followed, response bodies are bounded, error bodies are never surfaced and bearer credentials
 * are accepted only in memory. The server remains authoritative for identity, tenant and permission state.
 */
public final class ConfigurationManifestHttpClient {
  private static final int MAX_RESPONSE_BYTES = 2_000_000;
  private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(5);
  private static final Duration DEFAULT_REQUEST_TIMEOUT = Duration.ofSeconds(10);
  private static final String RUNTIME_MANIFEST_PATH =
      "/api/v1/configuration/runtime/manifest";

  private final HttpClient client;
  private final Duration requestTimeout;

  public ConfigurationManifestHttpClient() {
    this(DEFAULT_CONNECT_TIMEOUT, DEFAULT_REQUEST_TIMEOUT);
  }

  public ConfigurationManifestHttpClient(Duration connectTimeout, Duration requestTimeout) {
    this.requestTimeout = boundedTimeout(requestTimeout, "requestTimeout");
    this.client =
        HttpClient.newBuilder()
            .connectTimeout(boundedTimeout(connectTimeout, "connectTimeout"))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
  }

  public ConfigurationManifestClient.RuntimeManifestResponse fetchRuntimeManifest(
      URI endpoint, String bearerToken) throws IOException, InterruptedException {
    validateEndpoint(endpoint);
    validateBearerToken(bearerToken);
    HttpRequest request =
        HttpRequest.newBuilder(endpoint)
            .timeout(requestTimeout)
            .header("Accept", "application/json")
            .header("Authorization", "Bearer " + bearerToken)
            .GET()
            .build();
    HttpResponse<InputStream> response =
        client.send(request, HttpResponse.BodyHandlers.ofInputStream());
    try (InputStream body = response.body()) {
      if (response.statusCode() != 200) {
        throw new ConfigurationHttpException(
            "HTTP_STATUS_UNEXPECTED", response.statusCode());
      }
      String contentType = response.headers().firstValue("Content-Type").orElse("");
      String mediaType = contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
      if (!"application/json".equals(mediaType)) {
        throw new ConfigurationHttpException("CONTENT_TYPE_INVALID", response.statusCode());
      }
      OptionalLong contentLength = response.headers().firstValueAsLong("Content-Length");
      if (contentLength.isPresent() && contentLength.getAsLong() > MAX_RESPONSE_BYTES) {
        throw new ConfigurationHttpException("RESPONSE_TOO_LARGE", response.statusCode());
      }
      byte[] payload = readBounded(body);
      return ConfigurationManifestClient.decodeRuntimeManifest(
          new String(payload, StandardCharsets.UTF_8));
    }
  }

  private static Duration boundedTimeout(Duration value, String name) {
    if (value == null || value.isZero() || value.isNegative() || value.compareTo(Duration.ofMinutes(2)) > 0) {
      throw new IllegalArgumentException(name + " must be between one nanosecond and two minutes");
    }
    return value;
  }

  private static void validateEndpoint(URI endpoint) {
    if (endpoint == null || !endpoint.isAbsolute() || endpoint.getHost() == null) {
      throw new IllegalArgumentException("ENDPOINT_ABSOLUTE_URI_REQUIRED");
    }
    if (endpoint.getUserInfo() != null || endpoint.getFragment() != null) {
      throw new IllegalArgumentException("ENDPOINT_AUTHORITY_OR_FRAGMENT_INVALID");
    }
    if (!RUNTIME_MANIFEST_PATH.equals(endpoint.getPath()) || endpoint.getRawQuery() == null) {
      throw new IllegalArgumentException("RUNTIME_MANIFEST_ENDPOINT_REQUIRED");
    }
    String scheme = endpoint.getScheme().toLowerCase(Locale.ROOT);
    if ("https".equals(scheme)) return;
    if ("http".equals(scheme) && isLoopbackHost(endpoint.getHost())) return;
    if ("http".equals(scheme)) {
      throw new IllegalArgumentException("NON_LOOPBACK_HTTP_PROHIBITED");
    }
    throw new IllegalArgumentException("ENDPOINT_SCHEME_UNSUPPORTED");
  }

  private static boolean isLoopbackHost(String host) {
    String normalized = host.toLowerCase(Locale.ROOT);
    return "localhost".equals(normalized)
        || "127.0.0.1".equals(normalized)
        || "::1".equals(normalized)
        || "[::1]".equals(normalized);
  }

  private static void validateBearerToken(String bearerToken) {
    if (bearerToken == null || bearerToken.length() < 16 || bearerToken.length() > 16_384) {
      throw new IllegalArgumentException("BEARER_TOKEN_LENGTH_INVALID");
    }
    for (int index = 0; index < bearerToken.length(); index += 1) {
      char value = bearerToken.charAt(index);
      if (Character.isWhitespace(value) || Character.isISOControl(value)) {
        throw new IllegalArgumentException("BEARER_TOKEN_CHARACTERS_INVALID");
      }
    }
  }

  private static byte[] readBounded(InputStream input) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8_192];
    int count;
    while ((count = input.read(buffer)) != -1) {
      if (output.size() + count > MAX_RESPONSE_BYTES) {
        throw new ConfigurationHttpException("RESPONSE_TOO_LARGE", 200);
      }
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  public static final class ConfigurationHttpException extends IOException {
    private static final long serialVersionUID = 1L;

    public final String code;
    public final int statusCode;

    private ConfigurationHttpException(String code, int statusCode) {
      super(code);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  public static void main(String[] args) {
    try {
      URI endpoint = URI.create(requiredEnvironment("CONFIGURATION_RUNTIME_MANIFEST_URL"));
      String bearerToken = requiredEnvironment("CONFIGURATION_BEARER_TOKEN");
      ConfigurationManifestClient.RuntimeManifestResponse response =
          new ConfigurationManifestHttpClient().fetchRuntimeManifest(endpoint, bearerToken);
      String transport = "https".equalsIgnoreCase(endpoint.getScheme()) ? "https" : "loopback-http";
      System.out.println(
          "{\"status\":\"passed\",\"httpStatus\":200,\"transport\":\""
              + transport
              + "\",\"fieldCount\":"
              + response.manifest.fields.size()
              + ",\"sectionCount\":"
              + response.manifest.sections.size()
              + ",\"checksum\":\""
              + response.checksum
              + "\"}");
    } catch (ConfigurationHttpException error) {
      System.err.println(
          "CONFIGURATION_HTTP_ERROR: code=" + error.code + " status=" + error.statusCode);
      System.exit(3);
    } catch (IllegalArgumentException error) {
      System.err.println("CONFIGURATION_CLIENT_CONFIGURATION_INVALID: " + error.getMessage());
      System.exit(4);
    } catch (IOException error) {
      System.err.println("CONFIGURATION_HTTP_IO_FAILURE");
      System.exit(5);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      System.err.println("CONFIGURATION_HTTP_INTERRUPTED");
      System.exit(6);
    }
  }

  private static String requiredEnvironment(String name) {
    String value = System.getenv(name);
    if (value == null || value.isEmpty()) {
      throw new IllegalArgumentException(name + " is required");
    }
    return value;
  }
}
