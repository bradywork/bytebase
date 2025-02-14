package v1

import "testing"

func TestValidatePhone(t *testing.T) {
	tests := []struct {
		phone string
		want  bool
	}{
		{
			phone: "1234567890",
			want:  false,
		},
		{
			phone: "+8615655556666",
			want:  true,
		},
	}

	for _, test := range tests {
		got := validatePhone(test.phone)
		isValid := got == nil
		if isValid != test.want {
			t.Errorf("validatePhone %s, err %v", test.phone, got)
		}
	}
}
