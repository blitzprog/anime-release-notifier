package utils

import (
	"fmt"

	"github.com/animenotifier/arn"
	"github.com/pariz/gountries"
)

// Current currency rates
const (
	yenToEuro   = 0.0075
	yenToDollar = 0.0093
)

var countryQuery = gountries.New()

// YenToUserCurrency converts the Yen price to the user currency.
func YenToUserCurrency(amount int, user *arn.User) string {
	if user == nil || user.Location.CountryName == "" {
		return fmt.Sprintf("%.2f $", float64(amount)*yenToDollar)
	}

	country, err := countryQuery.FindCountryByName(user.Location.CountryName)

	if err != nil {
		return fmt.Sprintf("%.2f $", float64(amount)*yenToDollar)
	}

	if arn.Contains(country.Currencies, "EUR") {
		return fmt.Sprintf("%.2f €", float64(amount)*yenToEuro)
	}

	return fmt.Sprintf("%.2f $", float64(amount)*yenToDollar)
}
