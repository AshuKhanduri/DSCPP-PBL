// JsonWriter.h - minimal streaming JSON writer (no external dependencies).
#ifndef JSON_WRITER_H
#define JSON_WRITER_H

#include <sstream>
#include <string>
#include <vector>

class JsonWriter {
public:
    JsonWriter &beginObject() { separator(); out_ << '{'; first_.push_back(true); return *this; }
    JsonWriter &endObject()   { out_ << '}'; first_.pop_back(); return *this; }
    JsonWriter &beginArray()  { separator(); out_ << '['; first_.push_back(true); return *this; }
    JsonWriter &endArray()    { out_ << ']'; first_.pop_back(); return *this; }

    JsonWriter &key(const std::string &k) {
        separator();
        writeString(k);
        out_ << ':';
        pendingKey_ = true;
        return *this;
    }
    JsonWriter &value(const std::string &v) { separator(); writeString(v); return *this; }
    JsonWriter &value(const char *v)        { return value(std::string(v)); }
    JsonWriter &value(int v)                { separator(); out_ << v; return *this; }
    JsonWriter &value(double v)             { separator(); out_ << v; return *this; }
    JsonWriter &value(bool v)               { separator(); out_ << (v ? "true" : "false"); return *this; }
    JsonWriter &null()                      { separator(); out_ << "null"; return *this; }

    template <typename T>
    JsonWriter &field(const std::string &k, const T &v) { key(k); return value(v); }

    std::string str() const { return out_.str(); }

private:
    void separator() {
        if (pendingKey_) { pendingKey_ = false; return; }   // value directly after a key
        if (first_.empty()) return;
        if (!first_.back()) out_ << ',';
        first_.back() = false;
    }
    void writeString(const std::string &s) {
        out_ << '"';
        for (char c : s) {
            switch (c) {
                case '"':  out_ << "\\\""; break;
                case '\\': out_ << "\\\\"; break;
                case '\n': out_ << "\\n"; break;
                case '\r': break;
                case '\t': out_ << "\\t"; break;
                default:   out_ << c;
            }
        }
        out_ << '"';
    }

    std::ostringstream out_;
    std::vector<bool> first_;
    bool pendingKey_ = false;
};

#endif
