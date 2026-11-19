package main

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
)

func probeDecodeRequest(reader io.Reader, streaming bool) (ConvertRequest, error) {
	var request ConvertRequest
	if !streaming {
		body, err := io.ReadAll(reader)
		if err != nil {
			return request, err
		}
		err = json.Unmarshal(body, &request)
		return request, err
	}
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("unexpected second JSON value")
		}
		return request, err
	}
	return request, nil
}

func BenchmarkRequestBodyDecodingProbe(b *testing.B) {
	for _, size := range []int{1024, 64 * 1024, 2 * 1024 * 1024} {
		html := "<p>" + strings.Repeat("document content ", size/17) + "</p>"
		body, err := json.Marshal(ConvertRequest{HTML: html})
		if err != nil {
			b.Fatal(err)
		}
		bodyText := string(body)
		for _, streaming := range []bool{false, true} {
			b.Run(fmt.Sprintf("bytes_%d/streaming_%t", len(body), streaming), func(b *testing.B) {
				b.ReportAllocs()
				b.SetBytes(int64(len(body)))
				for i := 0; i < b.N; i++ {
					request, err := probeDecodeRequest(strings.NewReader(bodyText), streaming)
					if err != nil || request.HTML != html {
						b.Fatalf("decode mismatch: %v", err)
					}
				}
			})
		}
	}
}
