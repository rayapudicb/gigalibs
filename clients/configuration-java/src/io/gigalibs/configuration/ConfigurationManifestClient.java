package io.gigalibs.configuration;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Dependency-free Java 11 decoder for the GigaLibs Configuration Studio runtime-manifest response.
 *
 * <p>The client deliberately implements its own strict JSON boundary. It rejects duplicate/unknown keys,
 * incompatible field/component pairs, broken references and response/manifest checksum disagreement.
 * It does not compile tenant definitions or make authorization decisions; those remain server authority.
 */
public final class ConfigurationManifestClient {
  private static final int MAX_INPUT_BYTES = 2_000_000;
  private static final Pattern KEY =
      Pattern.compile("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");
  private static final Pattern PERMISSION =
      Pattern.compile("^[a-z][a-z0-9-]*:(?:\\*|[a-z][a-z0-9-]*)$");
  private static final Pattern CHECKSUM = Pattern.compile("^sha256:[a-f0-9]{64}$");
  private static final Set<String> MODES = Set.of("CREATE", "EDIT", "READ", "LIST");
  private static final Set<String> FIELD_TYPES =
      Set.of(
          "TEXT",
          "TEXTAREA",
          "NUMBER",
          "INTEGER",
          "BOOLEAN",
          "DATE",
          "DATETIME",
          "EMAIL",
          "PHONE",
          "URL",
          "CURRENCY",
          "SELECT",
          "MULTI_SELECT");
  private static final Set<String> COMPONENTS =
      Set.of(
          "text-input",
          "textarea",
          "number-input",
          "checkbox",
          "date-input",
          "datetime-input",
          "select",
          "multi-select");
  private static final Set<String> CLASSIFICATIONS =
      Set.of("PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED");
  private static final Set<String> CONDITION_OPERATORS =
      Set.of(
          "EQUALS",
          "NOT_EQUALS",
          "IS_EMPTY",
          "IS_NOT_EMPTY",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL",
          "IN",
          "CONTAINS");
  private static final Map<String, Set<String>> COMPONENT_TYPES = componentTypes();

  private ConfigurationManifestClient() {}

  public static RuntimeManifestResponse decodeRuntimeManifest(String json) {
    Object parsed = new JsonParser(json).parse();
    Map<String, Object> root = object(parsed, "$response");
    exactKeys(
        root,
        Set.of("activationId", "publishedVersionId", "activatedAt", "manifest", "checksum"),
        Set.of("activationId", "publishedVersionId", "activatedAt", "manifest", "checksum"),
        "$response");
    String activationId = boundedString(root, "activationId", 1, 200, "$response");
    String publishedVersionId =
        boundedString(root, "publishedVersionId", 1, 200, "$response");
    String activatedAt = boundedString(root, "activatedAt", 1, 100, "$response");
    try {
      Instant.parse(activatedAt);
    } catch (DateTimeParseException error) {
      throw invalid("$response.activatedAt must be an RFC 3339 instant");
    }
    String responseChecksum = checksum(root, "checksum", "$response");
    Manifest manifest = decodeManifest(object(root.get("manifest"), "$response.manifest"));
    if (!responseChecksum.equals(manifest.checksum)) {
      throw invalid("$response.checksum must equal $response.manifest.checksum");
    }
    return new RuntimeManifestResponse(
        activationId, publishedVersionId, activatedAt, responseChecksum, manifest);
  }

  public static Manifest decodeManifest(String json) {
    return decodeManifest(object(new JsonParser(json).parse(), "$manifest"));
  }

  private static Manifest decodeManifest(Map<String, Object> root) {
    Set<String> required =
        Set.of(
            "contractVersion",
            "moduleKey",
            "entityKey",
            "surfaceKey",
            "mode",
            "title",
            "fields",
            "sections",
            "compilerVersion",
            "checksum");
    Set<String> allowed = new HashSet<>(required);
    allowed.add("description");
    allowed.add("listView");
    exactKeys(root, required, allowed, "$manifest");

    String contractVersion = boundedString(root, "contractVersion", 3, 20, "$manifest");
    if (!"1.0".equals(contractVersion)) throw invalid("Unsupported contractVersion");
    String compilerVersion = boundedString(root, "compilerVersion", 1, 100, "$manifest");
    if (!"1.0.0".equals(compilerVersion)) throw invalid("Unsupported compilerVersion");
    String moduleKey = key(root, "moduleKey", "$manifest");
    String entityKey = key(root, "entityKey", "$manifest");
    String surfaceKey = key(root, "surfaceKey", "$manifest");
    String mode = boundedString(root, "mode", 1, 20, "$manifest");
    requireMember(MODES, mode, "$manifest.mode");
    String title = boundedString(root, "title", 1, 160, "$manifest");
    optionalBoundedString(root, "description", 0, 1_000, "$manifest");
    String manifestChecksum = checksum(root, "checksum", "$manifest");

    List<Object> fieldValues = array(root.get("fields"), "$manifest.fields", 0, 250);
    List<Field> fields = new ArrayList<>();
    Map<String, Field> fieldsByKey = new LinkedHashMap<>();
    List<Map<String, Object>> rawFields = new ArrayList<>();
    for (int index = 0; index < fieldValues.size(); index += 1) {
      String path = "$manifest.fields[" + index + "]";
      Map<String, Object> raw = object(fieldValues.get(index), path);
      Field field = decodeField(raw, path);
      if (fieldsByKey.put(field.key, field) != null) {
        throw invalid(path + ".key duplicates " + field.key);
      }
      fields.add(field);
      rawFields.add(raw);
    }

    for (int index = 0; index < rawFields.size(); index += 1) {
      Map<String, Object> raw = rawFields.get(index);
      Field target = fields.get(index);
      validateConditionIfPresent(
          raw.get("visibleWhen"), target, fieldsByKey, "$manifest.fields[" + index + "].visibleWhen");
      validateConditionIfPresent(
          raw.get("requiredWhen"), target, fieldsByKey, "$manifest.fields[" + index + "].requiredWhen");
    }

    List<Object> sectionValues = array(root.get("sections"), "$manifest.sections", 0, 50);
    List<Section> sections = new ArrayList<>();
    Set<String> sectionKeys = new HashSet<>();
    Set<String> placedFields = new HashSet<>();
    for (int index = 0; index < sectionValues.size(); index += 1) {
      String path = "$manifest.sections[" + index + "]";
      Section section = decodeSection(object(sectionValues.get(index), path), path, fieldsByKey);
      if (!sectionKeys.add(section.key)) throw invalid(path + ".key is duplicated");
      for (String fieldKey : section.fieldKeys) {
        if (!placedFields.add(fieldKey)) {
          throw invalid(path + ".fieldKeys places " + fieldKey + " more than once");
        }
      }
      sections.add(section);
    }
    if (!placedFields.equals(fieldsByKey.keySet())) {
      throw invalid("$manifest.sections must place every field exactly once");
    }
    if (root.containsKey("listView")) {
      validateListView(object(root.get("listView"), "$manifest.listView"), fieldsByKey);
    }

    return new Manifest(
        contractVersion,
        compilerVersion,
        moduleKey,
        entityKey,
        surfaceKey,
        mode,
        title,
        manifestChecksum,
        fields,
        sections);
  }

  private static Field decodeField(Map<String, Object> raw, String path) {
    Set<String> required =
        Set.of("key", "label", "type", "component", "required", "readOnly", "classification");
    Set<String> allowed = new HashSet<>(required);
    Collections.addAll(
        allowed,
        "helpText",
        "readPermission",
        "writePermission",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "patternKey",
        "options",
        "defaultValue",
        "visibleWhen",
        "requiredWhen");
    exactKeys(raw, required, allowed, path);
    String fieldKey = key(raw, "key", path);
    boundedString(raw, "label", 1, 160, path);
    optionalBoundedString(raw, "helpText", 0, 500, path);
    String type = boundedString(raw, "type", 1, 30, path);
    String component = boundedString(raw, "component", 1, 30, path);
    requireMember(FIELD_TYPES, type, path + ".type");
    requireMember(COMPONENTS, component, path + ".component");
    if (!COMPONENT_TYPES.get(component).contains(type)) {
      throw invalid(path + ".component cannot render " + type);
    }
    boolean requiredValue = bool(raw, "required", path);
    boolean readOnly = bool(raw, "readOnly", path);
    String classification = boundedString(raw, "classification", 1, 30, path);
    requireMember(CLASSIFICATIONS, classification, path + ".classification");
    permissionIfPresent(raw, "readPermission", path);
    permissionIfPresent(raw, "writePermission", path);
    numberIfPresent(raw, "minimum", path);
    numberIfPresent(raw, "maximum", path);
    integerIfPresent(raw, "minLength", 0, 10_000, path);
    integerIfPresent(raw, "maxLength", 1, 10_000, path);
    if (raw.containsKey("patternKey")) key(raw, "patternKey", path);
    if (raw.containsKey("defaultValue") && !isScalar(raw.get("defaultValue"))) {
      throw invalid(path + ".defaultValue must be a scalar");
    }
    if (raw.containsKey("options")) validateOptions(raw.get("options"), path + ".options");
    if (("SELECT".equals(type) || "MULTI_SELECT".equals(type)) && !raw.containsKey("options")) {
      throw invalid(path + ".options are required for " + type);
    }
    return new Field(fieldKey, type, component, requiredValue, readOnly, classification);
  }

  private static Section decodeSection(
      Map<String, Object> raw, String path, Map<String, Field> fieldsByKey) {
    Set<String> required = Set.of("key", "title", "columns", "fieldKeys");
    Set<String> allowed = new HashSet<>(required);
    allowed.add("description");
    exactKeys(raw, required, allowed, path);
    String sectionKey = key(raw, "key", path);
    boundedString(raw, "title", 1, 160, path);
    optionalBoundedString(raw, "description", 0, 500, path);
    integer(raw.get("columns"), 1, 3, path + ".columns");
    List<Object> fieldKeyValues = array(raw.get("fieldKeys"), path + ".fieldKeys", 1, 100);
    List<String> fieldKeys = new ArrayList<>();
    for (int index = 0; index < fieldKeyValues.size(); index += 1) {
      String fieldKey = string(fieldKeyValues.get(index), path + ".fieldKeys[" + index + "]");
      validateKey(fieldKey, path + ".fieldKeys[" + index + "]");
      if (!fieldsByKey.containsKey(fieldKey)) {
        throw invalid(path + ".fieldKeys references unknown field " + fieldKey);
      }
      fieldKeys.add(fieldKey);
    }
    return new Section(sectionKey, fieldKeys);
  }

  private static void validateListView(Map<String, Object> raw, Map<String, Field> fieldsByKey) {
    Set<String> required = Set.of("columnKeys", "defaultSortDirection");
    Set<String> allowed = new HashSet<>(required);
    Collections.addAll(allowed, "defaultSortKey", "searchableFieldKeys", "quickFilters");
    exactKeys(raw, required, allowed, "$manifest.listView");
    validateFieldReferences(
        raw.get("columnKeys"), "$manifest.listView.columnKeys", 1, 20, fieldsByKey);
    String direction =
        boundedString(raw, "defaultSortDirection", 3, 4, "$manifest.listView");
    requireMember(Set.of("ASC", "DESC"), direction, "$manifest.listView.defaultSortDirection");
    if (raw.containsKey("defaultSortKey")) {
      String sortKey = key(raw, "defaultSortKey", "$manifest.listView");
      requireField(fieldsByKey, sortKey, "$manifest.listView.defaultSortKey");
    }
    if (raw.containsKey("searchableFieldKeys")) {
      validateFieldReferences(
          raw.get("searchableFieldKeys"),
          "$manifest.listView.searchableFieldKeys",
          0,
          20,
          fieldsByKey);
    }
    if (raw.containsKey("quickFilters")) {
      List<Object> filters =
          array(raw.get("quickFilters"), "$manifest.listView.quickFilters", 0, 20);
      for (int index = 0; index < filters.size(); index += 1) {
        String path = "$manifest.listView.quickFilters[" + index + "]";
        Map<String, Object> filter = object(filters.get(index), path);
        exactKeys(
            filter,
            Set.of("label", "fieldKey", "operator"),
            Set.of("label", "fieldKey", "operator", "value"),
            path);
        boundedString(filter, "label", 1, 80, path);
        String fieldKey = key(filter, "fieldKey", path);
        requireField(fieldsByKey, fieldKey, path + ".fieldKey");
        String operator = boundedString(filter, "operator", 1, 40, path);
        requireMember(CONDITION_OPERATORS, operator, path + ".operator");
        if (filter.containsKey("value") && !isScalar(filter.get("value"))) {
          throw invalid(path + ".value must be a scalar");
        }
      }
    }
  }

  private static void validateConditionIfPresent(
      Object condition,
      Field target,
      Map<String, Field> fieldsByKey,
      String path) {
    if (condition == null) return;
    validateCondition(condition, target, fieldsByKey, path, 1, new int[] {0});
  }

  private static void validateCondition(
      Object value,
      Field target,
      Map<String, Field> fieldsByKey,
      String path,
      int depth,
      int[] nodes) {
    nodes[0] += 1;
    if (depth > 5) throw invalid(path + " exceeds five nested levels");
    if (nodes[0] > 50) throw invalid(path + " exceeds 50 nodes");
    Map<String, Object> condition = object(value, path);
    String kind = boundedString(condition, "kind", 1, 20, path);
    if ("GROUP".equals(kind)) {
      exactKeys(condition, Set.of("kind", "combinator", "conditions"), Set.of("kind", "combinator", "conditions"), path);
      String combinator = boundedString(condition, "combinator", 3, 3, path);
      requireMember(Set.of("ALL", "ANY"), combinator, path + ".combinator");
      List<Object> children = array(condition.get("conditions"), path + ".conditions", 1, 20);
      for (int index = 0; index < children.size(); index += 1) {
        validateCondition(children.get(index), target, fieldsByKey, path + ".conditions[" + index + "]", depth + 1, nodes);
      }
      return;
    }
    if (!"PREDICATE".equals(kind)) throw invalid(path + ".kind is unsupported");
    exactKeys(condition, Set.of("kind", "fieldKey", "operator"), Set.of("kind", "fieldKey", "operator", "value"), path);
    String fieldKey = key(condition, "fieldKey", path);
    requireField(fieldsByKey, fieldKey, path + ".fieldKey");
    if (fieldKey.equals(target.key)) throw invalid(path + " cannot reference its own field");
    String operator = boundedString(condition, "operator", 1, 40, path);
    requireMember(CONDITION_OPERATORS, operator, path + ".operator");
    boolean emptyOperator = "IS_EMPTY".equals(operator) || "IS_NOT_EMPTY".equals(operator);
    if (emptyOperator && condition.containsKey("value")) {
      throw invalid(path + ".value is prohibited for " + operator);
    }
    if (!emptyOperator && !condition.containsKey("value")) {
      throw invalid(path + ".value is required for " + operator);
    }
    if (condition.containsKey("value") && !isConditionValue(condition.get("value"))) {
      throw invalid(path + ".value is not a supported condition value");
    }
  }

  private static void validateOptions(Object value, String path) {
    List<Object> options = array(value, path, 1, 200);
    for (int index = 0; index < options.size(); index += 1) {
      String itemPath = path + "[" + index + "]";
      Map<String, Object> option = object(options.get(index), itemPath);
      exactKeys(option, Set.of("value", "label"), Set.of("value", "label"), itemPath);
      boundedString(option, "value", 1, 200, itemPath);
      boundedString(option, "label", 1, 200, itemPath);
    }
  }

  private static void validateFieldReferences(
      Object value, String path, int minimum, int maximum, Map<String, Field> fieldsByKey) {
    List<Object> values = array(value, path, minimum, maximum);
    for (int index = 0; index < values.size(); index += 1) {
      String itemPath = path + "[" + index + "]";
      String fieldKey = string(values.get(index), itemPath);
      validateKey(fieldKey, itemPath);
      requireField(fieldsByKey, fieldKey, itemPath);
    }
  }

  private static void requireField(Map<String, Field> fieldsByKey, String fieldKey, String path) {
    if (!fieldsByKey.containsKey(fieldKey)) throw invalid(path + " references an unknown field");
  }

  private static void permissionIfPresent(Map<String, Object> value, String key, String path) {
    if (!value.containsKey(key)) return;
    String permission = boundedString(value, key, 3, 120, path);
    if (!PERMISSION.matcher(permission).matches()) throw invalid(path + "." + key + " is invalid");
  }

  private static void numberIfPresent(Map<String, Object> value, String key, String path) {
    if (value.containsKey(key) && !(value.get(key) instanceof BigDecimal)) {
      throw invalid(path + "." + key + " must be a number");
    }
  }

  private static void integerIfPresent(
      Map<String, Object> value, String key, int minimum, int maximum, String path) {
    if (value.containsKey(key)) integer(value.get(key), minimum, maximum, path + "." + key);
  }

  private static int integer(Object value, int minimum, int maximum, String path) {
    if (!(value instanceof BigDecimal)) throw invalid(path + " must be an integer");
    BigDecimal number = ((BigDecimal) value).stripTrailingZeros();
    if (number.scale() > 0) throw invalid(path + " must be an integer");
    int result;
    try {
      result = number.intValueExact();
    } catch (ArithmeticException error) {
      throw invalid(path + " is outside the supported integer range");
    }
    if (result < minimum || result > maximum) throw invalid(path + " is outside its allowed range");
    return result;
  }

  private static String key(Map<String, Object> value, String key, String path) {
    String result = boundedString(value, key, 2, 80, path);
    validateKey(result, path + "." + key);
    return result;
  }

  private static void validateKey(String value, String path) {
    if (value.length() < 2 || value.length() > 80 || !KEY.matcher(value).matches()) {
      throw invalid(path + " must be lowercase kebab-case");
    }
  }

  private static String checksum(Map<String, Object> value, String key, String path) {
    String result = boundedString(value, key, 71, 71, path);
    if (!CHECKSUM.matcher(result).matches()) throw invalid(path + "." + key + " is invalid");
    return result;
  }

  private static boolean bool(Map<String, Object> value, String key, String path) {
    Object result = value.get(key);
    if (!(result instanceof Boolean)) throw invalid(path + "." + key + " must be boolean");
    return ((Boolean) result).booleanValue();
  }

  private static String boundedString(
      Map<String, Object> value, String key, int minimum, int maximum, String path) {
    if (!value.containsKey(key)) throw invalid(path + "." + key + " is required");
    String result = string(value.get(key), path + "." + key);
    if (result.length() < minimum || result.length() > maximum) {
      throw invalid(path + "." + key + " has invalid length");
    }
    return result;
  }

  private static void optionalBoundedString(
      Map<String, Object> value, String key, int minimum, int maximum, String path) {
    if (value.containsKey(key)) boundedString(value, key, minimum, maximum, path);
  }

  private static String string(Object value, String path) {
    if (!(value instanceof String)) throw invalid(path + " must be a string");
    return (String) value;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> object(Object value, String path) {
    if (!(value instanceof Map)) throw invalid(path + " must be an object");
    return (Map<String, Object>) value;
  }

  @SuppressWarnings("unchecked")
  private static List<Object> array(
      Object value, String path, int minimum, int maximum) {
    if (!(value instanceof List)) throw invalid(path + " must be an array");
    List<Object> result = (List<Object>) value;
    if (result.size() < minimum || result.size() > maximum) {
      throw invalid(path + " has invalid item count");
    }
    return result;
  }

  private static void exactKeys(
      Map<String, Object> value, Set<String> required, Set<String> allowed, String path) {
    for (String key : required) {
      if (!value.containsKey(key)) throw invalid(path + "." + key + " is required");
    }
    for (String key : value.keySet()) {
      if (!allowed.contains(key)) throw invalid(path + "." + key + " is not allowed");
    }
  }

  private static void requireMember(Set<String> allowed, String value, String path) {
    if (!allowed.contains(value)) throw invalid(path + " has unsupported value");
  }

  private static boolean isScalar(Object value) {
    return value == null || value instanceof String || value instanceof BigDecimal || value instanceof Boolean;
  }

  private static boolean isConditionValue(Object value) {
    if (isScalar(value)) return true;
    if (!(value instanceof List)) return false;
    List<?> items = (List<?>) value;
    if (items.size() > 200) return false;
    for (Object item : items) {
      if (item == null || !(item instanceof String || item instanceof BigDecimal || item instanceof Boolean)) {
        return false;
      }
    }
    return true;
  }

  private static IllegalArgumentException invalid(String message) {
    return new IllegalArgumentException(message);
  }

  private static Map<String, Set<String>> componentTypes() {
    Map<String, Set<String>> values = new HashMap<>();
    values.put("text-input", Set.of("TEXT", "EMAIL", "PHONE", "URL"));
    values.put("textarea", Set.of("TEXTAREA"));
    values.put("number-input", Set.of("NUMBER", "INTEGER", "CURRENCY"));
    values.put("checkbox", Set.of("BOOLEAN"));
    values.put("date-input", Set.of("DATE"));
    values.put("datetime-input", Set.of("DATETIME"));
    values.put("select", Set.of("SELECT"));
    values.put("multi-select", Set.of("MULTI_SELECT"));
    return Collections.unmodifiableMap(values);
  }

  public static final class RuntimeManifestResponse {
    public final String activationId;
    public final String publishedVersionId;
    public final String activatedAt;
    public final String checksum;
    public final Manifest manifest;

    private RuntimeManifestResponse(
        String activationId,
        String publishedVersionId,
        String activatedAt,
        String checksum,
        Manifest manifest) {
      this.activationId = activationId;
      this.publishedVersionId = publishedVersionId;
      this.activatedAt = activatedAt;
      this.checksum = checksum;
      this.manifest = manifest;
    }
  }

  public static final class Manifest {
    public final String contractVersion;
    public final String compilerVersion;
    public final String moduleKey;
    public final String entityKey;
    public final String surfaceKey;
    public final String mode;
    public final String title;
    public final String checksum;
    public final List<Field> fields;
    public final List<Section> sections;

    private Manifest(
        String contractVersion,
        String compilerVersion,
        String moduleKey,
        String entityKey,
        String surfaceKey,
        String mode,
        String title,
        String checksum,
        List<Field> fields,
        List<Section> sections) {
      this.contractVersion = contractVersion;
      this.compilerVersion = compilerVersion;
      this.moduleKey = moduleKey;
      this.entityKey = entityKey;
      this.surfaceKey = surfaceKey;
      this.mode = mode;
      this.title = title;
      this.checksum = checksum;
      this.fields = Collections.unmodifiableList(new ArrayList<>(fields));
      this.sections = Collections.unmodifiableList(new ArrayList<>(sections));
    }
  }

  public static final class Field {
    public final String key;
    public final String type;
    public final String component;
    public final boolean required;
    public final boolean readOnly;
    public final String classification;

    private Field(
        String key,
        String type,
        String component,
        boolean required,
        boolean readOnly,
        String classification) {
      this.key = key;
      this.type = type;
      this.component = component;
      this.required = required;
      this.readOnly = readOnly;
      this.classification = classification;
    }
  }

  public static final class Section {
    public final String key;
    public final List<String> fieldKeys;

    private Section(String key, List<String> fieldKeys) {
      this.key = key;
      this.fieldKeys = Collections.unmodifiableList(new ArrayList<>(fieldKeys));
    }
  }

  public static void main(String[] args) throws IOException {
    byte[] input = readBoundedInput();
    try {
      RuntimeManifestResponse response =
          decodeRuntimeManifest(new String(input, StandardCharsets.UTF_8));
      Set<String> fieldTypes = new HashSet<>();
      Set<String> components = new HashSet<>();
      for (Field field : response.manifest.fields) {
        fieldTypes.add(field.type);
        components.add(field.component);
      }
      System.out.println(
          "{\"status\":\"passed\",\"contractVersion\":\""
              + response.manifest.contractVersion
              + "\",\"compilerVersion\":\""
              + response.manifest.compilerVersion
              + "\",\"fieldCount\":"
              + response.manifest.fields.size()
              + ",\"sectionCount\":"
              + response.manifest.sections.size()
              + ",\"fieldTypeCount\":"
              + fieldTypes.size()
              + ",\"componentCount\":"
              + components.size()
              + ",\"checksum\":\""
              + response.checksum
              + "\"}");
    } catch (IllegalArgumentException error) {
      System.err.println("CONFIGURATION_MANIFEST_INVALID: " + error.getMessage());
      System.exit(2);
    }
  }

  private static byte[] readBoundedInput() throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8_192];
    int count;
    while ((count = System.in.read(buffer)) != -1) {
      if (output.size() + count > MAX_INPUT_BYTES) {
        throw new IllegalArgumentException("Runtime manifest response exceeds input limit");
      }
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private static final class JsonParser {
    private final String input;
    private int position;
    private int depth;

    private JsonParser(String input) {
      this.input = input;
    }

    private Object parse() {
      skipWhitespace();
      Object value = parseValue();
      skipWhitespace();
      if (position != input.length()) throw invalid("JSON has trailing content");
      return value;
    }

    private Object parseValue() {
      if (position >= input.length()) throw invalid("JSON ended unexpectedly");
      char current = input.charAt(position);
      if (current == '{') return parseObject();
      if (current == '[') return parseArray();
      if (current == '"') return parseString();
      if (current == 't') return literal("true", Boolean.TRUE);
      if (current == 'f') return literal("false", Boolean.FALSE);
      if (current == 'n') return literal("null", null);
      if (current == '-' || (current >= '0' && current <= '9')) return parseNumber();
      throw invalid("JSON contains an unexpected token at offset " + position);
    }

    private Map<String, Object> parseObject() {
      enter();
      position += 1;
      skipWhitespace();
      Map<String, Object> result = new LinkedHashMap<>();
      if (consume('}')) {
        leave();
        return result;
      }
      while (true) {
        if (position >= input.length() || input.charAt(position) != '"') {
          throw invalid("JSON object key must be a string");
        }
        String key = parseString();
        skipWhitespace();
        expect(':');
        skipWhitespace();
        Object value = parseValue();
        if (result.containsKey(key)) throw invalid("JSON object contains duplicate key " + key);
        result.put(key, value);
        skipWhitespace();
        if (consume('}')) break;
        expect(',');
        skipWhitespace();
      }
      leave();
      return result;
    }

    private List<Object> parseArray() {
      enter();
      position += 1;
      skipWhitespace();
      List<Object> result = new ArrayList<>();
      if (consume(']')) {
        leave();
        return result;
      }
      while (true) {
        result.add(parseValue());
        skipWhitespace();
        if (consume(']')) break;
        expect(',');
        skipWhitespace();
      }
      leave();
      return result;
    }

    private String parseString() {
      expect('"');
      StringBuilder result = new StringBuilder();
      while (position < input.length()) {
        char current = input.charAt(position++);
        if (current == '"') return result.toString();
        if (current < 0x20) throw invalid("JSON string contains a control character");
        if (current != '\\') {
          result.append(current);
          continue;
        }
        if (position >= input.length()) throw invalid("JSON escape is incomplete");
        char escaped = input.charAt(position++);
        switch (escaped) {
          case '"': result.append('"'); break;
          case '\\': result.append('\\'); break;
          case '/': result.append('/'); break;
          case 'b': result.append('\b'); break;
          case 'f': result.append('\f'); break;
          case 'n': result.append('\n'); break;
          case 'r': result.append('\r'); break;
          case 't': result.append('\t'); break;
          case 'u': result.append(parseUnicodeEscape()); break;
          default: throw invalid("JSON contains an unsupported escape");
        }
      }
      throw invalid("JSON string is unterminated");
    }

    private char parseUnicodeEscape() {
      if (position + 4 > input.length()) throw invalid("JSON unicode escape is incomplete");
      int value = 0;
      for (int index = 0; index < 4; index += 1) {
        int digit = Character.digit(input.charAt(position++), 16);
        if (digit < 0) throw invalid("JSON unicode escape is invalid");
        value = (value << 4) + digit;
      }
      return (char) value;
    }

    private BigDecimal parseNumber() {
      int start = position;
      if (consume('-') && position >= input.length()) throw invalid("JSON number is incomplete");
      if (consume('0')) {
        if (position < input.length() && Character.isDigit(input.charAt(position))) {
          throw invalid("JSON number has a leading zero");
        }
      } else {
        digits();
      }
      if (consume('.')) digits();
      if (consume('e') || consume('E')) {
        consume('+');
        consume('-');
        digits();
      }
      try {
        return new BigDecimal(input.substring(start, position));
      } catch (NumberFormatException error) {
        throw invalid("JSON number is invalid");
      }
    }

    private void digits() {
      int start = position;
      while (position < input.length() && Character.isDigit(input.charAt(position))) position += 1;
      if (position == start) throw invalid("JSON number requires digits");
    }

    private Object literal(String expected, Object value) {
      if (!input.startsWith(expected, position)) throw invalid("JSON literal is invalid");
      position += expected.length();
      return value;
    }

    private void enter() {
      depth += 1;
      if (depth > 100) throw invalid("JSON nesting exceeds 100 levels");
    }

    private void leave() {
      depth -= 1;
    }

    private void skipWhitespace() {
      while (position < input.length()) {
        char value = input.charAt(position);
        if (value != ' ' && value != '\n' && value != '\r' && value != '\t') return;
        position += 1;
      }
    }

    private void expect(char expected) {
      if (!consume(expected)) throw invalid("JSON expected " + expected + " at offset " + position);
    }

    private boolean consume(char expected) {
      if (position < input.length() && input.charAt(position) == expected) {
        position += 1;
        return true;
      }
      return false;
    }
  }
}
