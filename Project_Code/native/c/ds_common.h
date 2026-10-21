/*
 * ds_common.h - shared constants and the JSON output helpers used by every
 * C module of the QuestForge DSA engine.
 */
#ifndef DS_COMMON_H
#define DS_COMMON_H

#include <stdio.h>

/* Maximum length (including '\0') of any text payload stored in a structure. */
#define DS_TEXT_MAX 64

/* Copy at most DS_TEXT_MAX-1 characters and always NUL-terminate. */
void ds_copy_text(char *dst, const char *src);

/* Print a JSON string literal (with quotes) to stdout, escaping as needed. */
void json_string(const char *s);

/* Print a JSON array of ints: [a,b,c] */
void json_int_array(const int *values, int count);

#endif
