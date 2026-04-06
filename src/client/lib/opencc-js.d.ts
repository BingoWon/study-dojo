declare module "opencc-js" {
	type Locale = string;
	const Locale: {
		from: { tw: Locale; hk: Locale; cn: Locale; t: Locale };
		to: { tw: Locale; hk: Locale; cn: Locale; t: Locale };
	};
	function ConverterFactory(from: Locale, to: Locale): (text: string) => string;
}
