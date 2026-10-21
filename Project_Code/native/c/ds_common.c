#include "ds_common.h"
#include <string.h>

void ds_copy_text(char *dst, const char *src)
{
    if (!src) { dst[0] = '\0'; return; }
    strncpy(dst, src, DS_TEXT_MAX - 1);
    dst[DS_TEXT_MAX - 1] = '\0';
}

void json_string(const char *s)
{
    putchar('"');
    for (; s && *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c == '\n') fputs("\\n", stdout);
        else if (c < 0x20) printf("\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}

void json_int_array(const int *values, int count)
{
    putchar('[');
    for (int i = 0; i < count; i++) {
        if (i) putchar(',');
        printf("%d", values[i]);
    }
    putchar(']');
}
