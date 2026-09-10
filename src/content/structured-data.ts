import { siteOrigin } from "../lib/agent-resources";

export const homepageStructuredData = [
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${siteOrigin}/#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: "Who is Aman Anu?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Aman Anu is a creative technologist, design engineer, and product builder based in Kochi, India.",
        },
      },
      {
        "@type": "Question",
        name: "What kind of work does Aman Anu do?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "His public work spans product systems, agentic AI workflows, creative technology, web experiences, and moving images.",
        },
      },
      {
        "@type": "Question",
        name: "How can I contact Aman Anu?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For collaboration, hiring, project, or speaking enquiries, use the contact page or email amananuworks@gmail.com.",
        },
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${siteOrigin}/#creative-technology-service`,
    name: "Creative technology and design engineering",
    description:
      "Aman Anu's public portfolio covers product architecture, agentic AI workflows, creative technology, and moving-image direction.",
    provider: { "@id": `${siteOrigin}/#aman-anu` },
    url: `${siteOrigin}/#work`,
  },
];
