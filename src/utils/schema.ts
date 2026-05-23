const SITE = "https://bytay.dev";

const AUTHOR_SAME_AS = [
  "https://github.com/17tayyy",
  "https://x.com/17tayyy",
  "https://www.linkedin.com/in/oscar-fernandez-45891229b/",
  "https://17tay.substack.com/",
];

const AUTHOR = {
  "@type": "Person",
  name: "Oscar Fernandez",
  url: SITE,
};

export function personSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Oscar Fernandez",
    alternateName: "Tay",
    url: SITE,
    jobTitle: "Backend Developer & Security Researcher",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Mataró",
      addressRegion: "Barcelona",
      addressCountry: "ES",
    },
    sameAs: AUTHOR_SAME_AS,
  };
}

interface ArticleArgs {
  title: string;
  description: string;
  datePublished: Date;
  url: string;
  image: string;
  tags: string[];
}

export function articleSchema({
  title,
  description,
  datePublished,
  url,
  image,
  tags,
}: ArticleArgs) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    image,
    datePublished: datePublished.toISOString(),
    author: AUTHOR,
    publisher: AUTHOR,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: tags.join(", "),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
