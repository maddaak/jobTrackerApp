package com.jobtracker.core.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import java.io.IOException;
import java.lang.reflect.AnnotatedElement;
import java.lang.reflect.AnnotatedParameterizedType;
import java.lang.reflect.AnnotatedType;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static org.assertj.core.api.Assertions.assertThat;

// A job's document has to fit in one Mongo document, so nothing a caller sends may be unbounded. Every
// request, and every record it carries, is checked, so a field added later without a limit fails here.
class RequestSizeLimitTests {

    @Test
    void everyTextAndListARequestCarriesHasALimit() throws Exception {
        List<String> unbounded = new ArrayList<>();
        Set<Class<?>> seen = new HashSet<>();
        for (Class<?> request : requests()) check(request, seen, unbounded);

        assertThat(unbounded).as("fields with no @Size").isEmpty();
    }

    private static List<Class<?>> requests() throws IOException, ClassNotFoundException {
        List<Class<?>> found = new ArrayList<>();
        for (Resource file : new PathMatchingResourcePatternResolver().getResources("classpath*:com/jobtracker/core/dto/*Request.class")) {
            found.add(Class.forName("com.jobtracker.core.dto." + file.getFilename().replace(".class", "")));
        }
        assertThat(found).as("request classes found").isNotEmpty();
        return found;
    }

    private static void check(Class<?> type, Set<Class<?>> seen, List<String> unbounded) throws NoSuchFieldException {
        if (!type.isRecord() || !seen.add(type)) return;
        for (RecordComponent component : type.getRecordComponents()) {
            String where = type.getSimpleName() + "." + component.getName();
            AnnotatedType declared = type.getDeclaredField(component.getName()).getAnnotatedType();
            checkValue(declared, type.getDeclaredField(component.getName()), where, seen, unbounded);
        }
    }

    private static void checkValue(AnnotatedType declared, AnnotatedElement annotations, String where,
            Set<Class<?>> seen, List<String> unbounded) throws NoSuchFieldException {
        Class<?> raw = rawClass(declared);
        boolean limited = annotations.isAnnotationPresent(Size.class) || declared.isAnnotationPresent(Size.class)
                // A pattern here is a closed list of words, which bounds it as well.
                || (raw == String.class && (annotations.isAnnotationPresent(Pattern.class) || declared.isAnnotationPresent(Pattern.class)));
        if ((raw == String.class || Collection.class.isAssignableFrom(raw) || Map.class.isAssignableFrom(raw)) && !limited) {
            unbounded.add(where);
        }
        if (declared instanceof AnnotatedParameterizedType parameterized) {
            for (AnnotatedType element : parameterized.getAnnotatedActualTypeArguments()) {
                checkValue(element, element, where + "[]", seen, unbounded);
            }
        } else {
            check(raw, seen, unbounded);
        }
    }

    private static Class<?> rawClass(AnnotatedType type) {
        return type.getType() instanceof Class<?> plain ? plain
                : (Class<?>) ((java.lang.reflect.ParameterizedType) type.getType()).getRawType();
    }
}
