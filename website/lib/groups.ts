import { Locale } from "./i18n";

export type GroupId = "intro" | "events" | "chat" | "ams";

export type GroupInfo = {
  id: GroupId;
  title: string;
  url: string;
  qrImage: string;
  description: Record<Locale, string>;
};

export const GROUPS: GroupInfo[] = [
  {
    id: "intro",
    title: "Intro - Vegan Activists NL",
    url: "https://signal.group/#CjQKIEccRwrDsYMpMuf0asj7FsPLQ2ya0U17ybH5dRn6aHeoEhBMxfl0llA0njdUUPvCb9eE",
    qrImage: "/signal-qr-intro.png",
    description: {
      nl: "Start hier voor een introductie tot Vegan Activists NL.",
      en: "Start here for an introduction to Vegan Activists NL.",
    },
  },
  {
    id: "chat",
    title: "Chat – Vegan Activists NL",
    url: "https://signal.group/#CjQKIIB7-NMkrv7nuNEr8P82F9-70Ckj0rEAWmrK_urPnT9zEhCijiRpEbVJWMYpolQR1u-d",
    qrImage: "/signal-qr-chat.jpg",
    description: {
      nl: "Bespreek dierenrechten met vegan activsten.",
      en: "Socialize with vegan activists about animal rights.",
    },
  },
  {
    id: "events",
    title: "Events – Vegan Activists NL",
    url: "https://signal.group/#CjQKIDB9f2aSHUHI7fh0Qw17Us9eCzT4zOC4rtgUo9EBuosxEhAX5OtDPGYorCmmE4rQ3AfU",
    qrImage: "/signal-qr-events.jpg",
    description: {
      nl: "Groep om dierenrechten events met elkaar te delen.",
      en: "Group for sharing events only.",
    },
  },
  {
    id: "ams",
    title: "Amsterdam - Vegan Activists NL",
    url: "https://signal.group/#CjQKIEzDaFr7f_RyA6HTo4rIJedmuQNORizFwCoyroR3j4Y_EhBaqZpT8fpsCtHy2nZjGS4Z",
    qrImage: "/signal-qr-ams.jpg",
    description: {
      nl: "Groep voor activisten in de Amsterdam regio.",
      en: "Group for activists in the Amsterdam region.",
    },
  },
];
