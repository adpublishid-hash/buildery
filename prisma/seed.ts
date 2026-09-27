import {
  PrismaClient,
  Role,
  MemberRole,
  BlockType,
  Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { blockDataSchemas } from "../lib/blocks/schema";
import { snapshotFormFields } from "../lib/form-publication";

const prisma = new PrismaClient();

type DemoUser = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

const demoUsers: DemoUser[] = [
  {
    name: "Super Admin",
    email: "wahib.chelsea@gmail.com",
    password: "Password123!",
    role: "SUPER_ADMIN",
  },
  {
    name: "Owner Demo",
    email: "owner@buildery.test",
    password: "Password123!",
    role: "OWNER",
  },
  {
    name: "Staff Demo",
    email: "staff@buildery.test",
    password: "Password123!",
    role: "STAFF",
  },
  {
    name: "Customer Demo",
    email: "customer@buildery.test",
    password: "Password123!",
    role: "CUSTOMER",
  },
  {
    name: "Affiliate Demo",
    email: "affiliate@buildery.test",
    password: "Password123!",
    role: "AFFILIATE",
  },
];

type WorkspaceSeed = {
  slug: string;
  name: string;
  primaryColor: string;
  ownerEmail: string;
  members: { email: string; role: Exclude<MemberRole, "OWNER"> }[];
};

const demoWorkspaces: WorkspaceSeed[] = [
  {
    slug: "acme-studio",
    name: "Acme Studio",
    primaryColor: "#0f172a",
    ownerEmail: "owner@buildery.test",
    members: [
      { email: "staff@buildery.test", role: "EDITOR" },
      { email: "customer@buildery.test", role: "VIEWER" },
    ],
  },
  {
    slug: "indie-lab",
    name: "Indie Lab",
    primaryColor: "#7c3aed",
    ownerEmail: "staff@buildery.test",
    members: [
      { email: "owner@buildery.test", role: "ADMIN" },
      { email: "affiliate@buildery.test", role: "VIEWER" },
    ],
  },
];

async function main() {
  console.log("Seeding demo users…");
  const usersByEmail = new Map<string, string>();
  for (const u of demoUsers) {
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        password: hashed,
        emailVerified: new Date(),
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        // Demo accounts skip the verification wizard.
        emailVerified: new Date(),
      },
    });
    usersByEmail.set(u.email, user.id);
    console.log(`  ✔ ${u.email}  [${u.role}]`);
  }

  // --- SaaS plans (global, Part 10) ---
  console.log("\nSeeding SaaS plans…");
  const planSeeds = [
    {
      tier: "FREE" as const,
      name: "Free",
      description: "Kick the tyres — one workspace, a handful of pages.",
      monthlyPrice: 0,
      compareAtMonthlyPrice: null,
      sortOrder: 0,
      features: [
        "1 workspace",
        "5 pages",
        "5 products",
        "100 orders per month",
        "2 months order history",
        "Blog included",
      ],
      workspaceLimit: 1,
      memberLimit: 2,
      pageLimit: 5,
      productLimit: 5,
      courseLimit: 0,
      formLimit: 0,
      monthlyOrderLimit: 100,
      orderRetentionMonths: 2,
      hasAffiliate: false,
      hasMembership: false,
      hasAdvancedAnalytics: false,
      customDomainEnabled: false,
      isPublic: true,
    },
    {
      tier: "STARTER" as const,
      name: "Starter",
      description: "For a growing side project.",
      monthlyPrice: 99_000,
      compareAtMonthlyPrice: 120_000,
      sortOrder: 1,
      features: [
        "3 workspaces",
        "20 pages",
        "50 products",
        "5 courses",
        "Blog & forms included",
      ],
      workspaceLimit: 3,
      memberLimit: 5,
      pageLimit: 20,
      productLimit: 50,
      courseLimit: 5,
      formLimit: null,
      monthlyOrderLimit: null,
      orderRetentionMonths: null,
      hasAffiliate: false,
      hasMembership: false,
      hasAdvancedAnalytics: false,
      customDomainEnabled: true,
      isPublic: true,
    },
    {
      tier: "PRO" as const,
      name: "Pro",
      description: "Everything you need to run a real business.",
      monthlyPrice: 299_000,
      compareAtMonthlyPrice: 350_000,
      sortOrder: 2,
      features: [
        "5 workspaces",
        "100 pages",
        "300 products",
        "20 courses",
        "Affiliate program",
        "Membership tiers",
        "Advanced analytics",
      ],
      workspaceLimit: 5,
      memberLimit: 20,
      pageLimit: 100,
      productLimit: 300,
      courseLimit: 20,
      formLimit: null,
      monthlyOrderLimit: null,
      orderRetentionMonths: null,
      hasAffiliate: true,
      hasMembership: true,
      hasAdvancedAnalytics: true,
      customDomainEnabled: true,
      isPublic: true,
    },
    {
      tier: "BUSINESS" as const,
      name: "Business",
      description: "Scale with unlimited content.",
      monthlyPrice: 499_000,
      compareAtMonthlyPrice: null,
      sortOrder: 3,
      features: [
        "25 workspaces",
        "Unlimited pages",
        "Unlimited products",
        "Unlimited courses",
        "Affiliate program",
        "Membership tiers",
        "Advanced analytics",
      ],
      workspaceLimit: 25,
      memberLimit: null,
      pageLimit: null,
      productLimit: null,
      courseLimit: null,
      formLimit: null,
      monthlyOrderLimit: null,
      orderRetentionMonths: null,
      hasAffiliate: true,
      hasMembership: true,
      hasAdvancedAnalytics: true,
      customDomainEnabled: true,
      // Tidak pernah ditampilkan di halaman harga; hanya diberikan admin
      // lewat /admin/users. Menandainya non-publik menjaga agar tidak bocor
      // lewat query lain yang cuma memfilter isPublic.
      isPublic: false,
    },
  ];
  const plansByTier = new Map<string, string>();
  for (const p of planSeeds) {
    const plan = await prisma.saaSPlan.upsert({
      where: { tier: p.tier },
      update: {
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        compareAtMonthlyPrice: p.compareAtMonthlyPrice,
        features: p.features,
        sortOrder: p.sortOrder,
        workspaceLimit: p.workspaceLimit,
        memberLimit: p.memberLimit,
        pageLimit: p.pageLimit,
        productLimit: p.productLimit,
        courseLimit: p.courseLimit,
        formLimit: p.formLimit ?? null,
        monthlyOrderLimit: p.monthlyOrderLimit ?? null,
        orderRetentionMonths: p.orderRetentionMonths ?? null,
        hasAffiliate: p.hasAffiliate,
        hasMembership: p.hasMembership,
        hasAdvancedAnalytics: p.hasAdvancedAnalytics,
        customDomainEnabled: p.customDomainEnabled,
        isPublic: p.isPublic ?? true,
      },
      create: {
        tier: p.tier,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice,
        compareAtMonthlyPrice: p.compareAtMonthlyPrice,
        features: p.features,
        sortOrder: p.sortOrder,
        workspaceLimit: p.workspaceLimit,
        memberLimit: p.memberLimit,
        pageLimit: p.pageLimit,
        productLimit: p.productLimit,
        courseLimit: p.courseLimit,
        formLimit: p.formLimit ?? null,
        monthlyOrderLimit: p.monthlyOrderLimit ?? null,
        orderRetentionMonths: p.orderRetentionMonths ?? null,
        hasAffiliate: p.hasAffiliate,
        hasMembership: p.hasMembership,
        hasAdvancedAnalytics: p.hasAdvancedAnalytics,
        customDomainEnabled: p.customDomainEnabled,
        isPublic: p.isPublic ?? true,
      },
    });
    plansByTier.set(p.tier, plan.id);
    console.log(`  ✔ ${p.name} plan`);
  }

  // Konfigurasi pembayaran QRIS tingkat platform. Dibuat kalau belum ada, dan
  // tidak ditimpa supaya nilai yang sudah diatur admin tidak hilang saat seed
  // dijalankan lagi.
  await prisma.saaSBillingSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      qrisMerchantName: "My Landing",
      paymentInstruction:
        "Transfer sesuai total pembayaran sampai 3 digit terakhir, lalu unggah bukti transfer. Verifikasi admin maksimal 1x24 jam.",
    },
  });
  console.log("  ✔ SaaS billing settings");

  // owner@buildery.test is on PRO so the demo affiliate/membership/
  // analytics features are unlocked out of the box.
  const proOwnerId = usersByEmail.get("owner@buildery.test");
  const proPlanId = plansByTier.get("PRO");
  if (proOwnerId && proPlanId) {
    await prisma.saaSSubscription.upsert({
      where: { userId: proOwnerId },
      update: {
        planId: proPlanId,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        graceUntil: null,
        expiredAt: null,
        lastReminderStage: 0,
      },
      create: {
        userId: proOwnerId,
        planId: proPlanId,
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    console.log("  ✔ owner@buildery.test subscribed to Pro");
  }

  // --- Website templates (global, Part 10) ---
  await prisma.siteTemplate.deleteMany({});
  await prisma.siteTemplate.createMany({
    data: [
      {
        name: "Minimal Landing",
        slug: "minimal-landing",
        description: "Hero, features, pricing, and a closing CTA.",
        isPublished: true,
      },
      {
        name: "Course Launch",
        slug: "course-launch",
        description: "A page tuned for selling an online course.",
        isPublished: true,
      },
      {
        name: "Agency Starter",
        slug: "agency-starter",
        description: "Work in progress — services + portfolio layout.",
        isPublished: false,
      },
    ],
  });
  console.log("  ✔ 3 website templates");

  console.log("\nSeeding demo workspaces…");
  const workspacesBySlug = new Map<string, string>();
  for (const w of demoWorkspaces) {
    const ownerId = usersByEmail.get(w.ownerEmail);
    if (!ownerId) {
      console.warn(`  ! Skipped ${w.slug} — owner ${w.ownerEmail} not found`);
      continue;
    }

    const workspace = await prisma.workspace.upsert({
      where: { slug: w.slug },
      update: {
        name: w.name,
        primaryColor: w.primaryColor,
      },
      create: {
        slug: w.slug,
        name: w.name,
        primaryColor: w.primaryColor,
        createdById: ownerId,
      },
    });

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: ownerId,
        },
      },
      update: { role: "OWNER" },
      create: {
        workspaceId: workspace.id,
        userId: ownerId,
        role: "OWNER",
      },
    });

    for (const m of w.members) {
      const memberId = usersByEmail.get(m.email);
      if (!memberId) continue;
      await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: memberId,
          },
        },
        update: { role: m.role },
        create: {
          workspaceId: workspace.id,
          userId: memberId,
          role: m.role,
        },
      });
    }

    workspacesBySlug.set(w.slug, workspace.id);
    console.log(`  ✔ ${w.slug}  (owner=${w.ownerEmail}, members=${w.members.length + 1})`);
  }

  console.log("\nSeeding demo website, pages + analytics…");
  const acmeId = workspacesBySlug.get("acme-studio");
  if (acmeId) {
    const website = await prisma.website.upsert({
      where: { workspaceId_slug: { workspaceId: acmeId, slug: "acme-studio" } },
      update: { name: "Acme Studio" },
      create: {
        workspaceId: acmeId,
        name: "Acme Studio",
        slug: "acme-studio",
        description: "The Acme Studio marketing site.",
      },
    });

    // Creates (or refreshes) a page and its block layout deterministically.
    async function seedPage(opts: {
      slug: string;
      title: string;
      status: "DRAFT" | "PUBLISHED";
      seoTitle?: string;
      metaDescription?: string;
      layout: BlockType[];
    }) {
      const publishedAt = opts.status === "PUBLISHED" ? new Date() : null;
      const page = await prisma.page.upsert({
        where: { websiteId_slug: { websiteId: website.id, slug: opts.slug } },
        update: {
          title: opts.title,
          status: opts.status,
          publishedAt,
          seoTitle: opts.seoTitle ?? null,
          metaDescription: opts.metaDescription ?? null,
        },
        create: {
          websiteId: website.id,
          slug: opts.slug,
          title: opts.title,
          status: opts.status,
          publishedAt,
          seoTitle: opts.seoTitle,
          metaDescription: opts.metaDescription,
        },
      });
      await prisma.pageBlock.deleteMany({ where: { pageId: page.id } });
      await prisma.pageBlock.createMany({
        data: opts.layout.map((type, index) => ({
          pageId: page.id,
          type,
          order: index,
          data: blockDataSchemas[type].parse({}),
        })),
      });
      console.log(
        `  ✔ page "${opts.slug}" (${opts.status}, ${opts.layout.length} blocks)`
      );
      return page;
    }

    const home = await seedPage({
      slug: "home",
      title: "Home",
      status: "PUBLISHED",
      seoTitle: "Acme Studio — Build websites in minutes",
      metaDescription:
        "A clean, fast landing page assembled from blocks with My Landing.",
      layout: ["HERO", "FEATURE_GRID", "TESTIMONIAL", "PRICING", "FAQ", "CTA"],
    });
    const about = await seedPage({
      slug: "about",
      title: "About",
      status: "PUBLISHED",
      seoTitle: "About Acme Studio",
      metaDescription: "Who we are and what we build.",
      layout: ["HERO", "TEXT", "FEATURE_GRID", "CTA"],
    });
    await seedPage({
      slug: "roadmap",
      title: "Roadmap",
      status: "DRAFT",
      layout: ["HERO", "TEXT", "FAQ"],
    });

    // Seed page_view analytics over the last 7 days for the published pages.
    await prisma.analyticsEvent.deleteMany({ where: { workspaceId: acmeId } });
    const referrers = [
      "https://www.google.com/",
      "https://twitter.com/",
      "https://news.ycombinator.com/",
      "https://www.producthunt.com/",
      "",
    ];
    const agents = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Mobile Safari",
    ];
    const events: Prisma.AnalyticsEventCreateManyInput[] = [];
    const addViews = (pageId: string, path: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const created = new Date(
          Date.now() -
            Math.floor(Math.random() * 7) * 86_400_000 -
            Math.floor(Math.random() * 86_400_000)
        );
        events.push({
          type: "PAGE_VIEW",
          workspaceId: acmeId,
          pageId,
          path,
          referrer: referrers[i % referrers.length] || null,
          userAgent: agents[i % agents.length],
          createdAt: created,
        });
      }
    };
    addViews(home.id, "/site/acme-studio", 34);
    addViews(about.id, "/site/acme-studio/about", 12);
    await prisma.analyticsEvent.createMany({ data: events });
    console.log(`  ✔ ${events.length} page_view events`);

    // --- Store: categories, products, a demo order ---
    await prisma.order.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.product.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.productCategory.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.customer.deleteMany({ where: { workspaceId: acmeId } });

    const apparel = await prisma.productCategory.create({
      data: { workspaceId: acmeId, name: "Apparel", slug: "apparel" },
    });
    const digital = await prisma.productCategory.create({
      data: { workspaceId: acmeId, name: "Digital Goods", slug: "digital-goods" },
    });

    const tee = await prisma.product.create({
      data: {
        workspaceId: acmeId,
        categoryId: apparel.id,
        name: "Classic Tee",
        slug: "classic-tee",
        description:
          "A soft, mid-weight cotton t-shirt with a clean Acme Studio print.",
        type: "PHYSICAL",
        status: "ACTIVE",
        price: 180_000,
        discountPrice: 150_000,
        stock: 40,
      },
    });
    const tote = await prisma.product.create({
      data: {
        workspaceId: acmeId,
        categoryId: apparel.id,
        name: "Canvas Tote Bag",
        slug: "canvas-tote-bag",
        description: "A sturdy everyday tote in heavy natural canvas.",
        type: "PHYSICAL",
        status: "ACTIVE",
        price: 120_000,
        stock: 25,
      },
    });
    await prisma.product.create({
      data: {
        workspaceId: acmeId,
        categoryId: apparel.id,
        name: "Sticker Pack",
        slug: "sticker-pack",
        description: "Ten die-cut vinyl stickers.",
        type: "PHYSICAL",
        status: "ACTIVE",
        price: 35_000,
        stock: 100,
      },
    });
    await prisma.product.create({
      data: {
        workspaceId: acmeId,
        categoryId: digital.id,
        name: "Notion Template Bundle",
        slug: "notion-template-bundle",
        description: "A pack of productivity templates, delivered as a link.",
        type: "DIGITAL",
        status: "ACTIVE",
        price: 90_000,
        discountPrice: 60_000,
        stock: 0,
      },
    });
    await prisma.product.create({
      data: {
        workspaceId: acmeId,
        categoryId: digital.id,
        name: "Brand Guideline (PDF)",
        slug: "brand-guideline-pdf",
        description: "The full Acme Studio brand book — work in progress.",
        type: "DIGITAL",
        status: "DRAFT",
        price: 250_000,
        stock: 0,
      },
    });
    console.log("  ✔ 2 categories, 5 products (4 active, 1 draft)");

    const customer = await prisma.customer.create({
      data: {
        workspaceId: acmeId,
        name: "Budi Santoso",
        email: "budi@example.com",
        phone: "0812-3456-7890",
      },
    });
    const demoSubtotal = 150_000 * 2 + 120_000;
    await prisma.order.create({
      data: {
        workspaceId: acmeId,
        customerId: customer.id,
        orderNumber: "ORD-DEMO01",
        status: "PAID",
        subtotal: demoSubtotal,
        total: demoSubtotal,
        note: "Please pack the items carefully.",
        items: {
          create: [
            {
              productId: tee.id,
              nameSnapshot: tee.name,
              unitPrice: 150_000,
              quantity: 2,
            },
            {
              productId: tote.id,
              nameSnapshot: tote.name,
              unitPrice: 120_000,
              quantity: 1,
            },
          ],
        },
        payment: {
          create: {
            workspaceId: acmeId,
            kind: "ORDER",
            amount: demoSubtotal,
            provider: "midtrans",
            paymentType: "bank_transfer",
            status: "PAID",
            paidAt: new Date(),
            midtransOrderId: "BD-DEMO01",
            transactionStatus: "settlement",
            description: "Order ORD-DEMO01",
          },
        },
      },
    });
    console.log("  ✔ 1 customer + 1 demo order (ORD-DEMO01, PAID)");

    // --- Courses / LMS demo ---
    await prisma.course.deleteMany({ where: { workspaceId: acmeId } });

    const course = await prisma.course.create({
      data: {
        workspaceId: acmeId,
        slug: "build-a-notion-style-site",
        title: "Build a Notion-style Site in 7 Days",
        summary:
          "A focused, hands-on course on shipping a minimal landing site with My Landing.",
        description:
          "By the end of this course you'll have a published site with a clean landing page, working storefront, and a small course of your own.",
        status: "PUBLISHED",
        isFree: true,
        price: 0,
        publishedAt: new Date(),
      },
    });

    const modulesSeed = [
      {
        title: "Foundations",
        lessons: [
          {
            title: "Why minimal Notion-style design works",
            type: "TEXT" as const,
            content: {
              body: "We'll cover the principles that make minimal layouts feel calm, fast, and trustworthy: whitespace, restrained color, a single accent, and consistent typography.",
            },
          },
          {
            title: "Tour of the My Landing dashboard",
            type: "VIDEO_EMBED" as const,
            content: {
              url: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
            },
          },
        ],
      },
      {
        title: "Designing the Layout",
        lessons: [
          {
            title: "Picking and arranging blocks",
            type: "TEXT" as const,
            content: {
              body: "Hero → Features → Social proof → Pricing → FAQ → CTA. Why that order works for most landing pages, and when to break it.",
            },
          },
          {
            title: "Design checklist (PDF)",
            type: "PDF" as const,
            content: {
              url: "https://www.orimi.com/pdf-test.pdf",
            },
          },
        ],
      },
      {
        title: "Going Live",
        lessons: [
          {
            title: "Publishing and previewing",
            type: "TEXT" as const,
            content: {
              body: "Move the page from DRAFT to PUBLISHED, share the public link, and confirm it renders correctly for visitors.",
            },
          },
          {
            title: "My Landing on GitHub",
            type: "LINK" as const,
            content: {
              url: "https://github.com/",
              label: "Open the repo",
            },
          },
        ],
      },
    ];

    const createdLessons: { moduleTitle: string; lessonId: string }[] = [];
    for (let i = 0; i < modulesSeed.length; i++) {
      const moduleSeed = modulesSeed[i];
      const mod = await prisma.courseModule.create({
        data: { courseId: course.id, title: moduleSeed.title, order: i },
      });
      for (let j = 0; j < moduleSeed.lessons.length; j++) {
        const ls = moduleSeed.lessons[j];
        const lesson = await prisma.courseLesson.create({
          data: {
            moduleId: mod.id,
            title: ls.title,
            type: ls.type,
            order: j,
            content: ls.content,
          },
        });
        createdLessons.push({
          moduleTitle: moduleSeed.title,
          lessonId: lesson.id,
        });
      }
    }
    console.log(
      `  ✔ course "${course.slug}" with ${modulesSeed.length} modules and ${createdLessons.length} lessons`
    );

    // Enrollment + a couple completed lessons for "Budi Santoso".
    const enrollment = await prisma.enrollment.create({
      data: {
        workspaceId: acmeId,
        courseId: course.id,
        customerId: customer.id,
      },
    });
    await prisma.lessonProgress.createMany({
      data: createdLessons.slice(0, 2).map((l) => ({
        enrollmentId: enrollment.id,
        lessonId: l.lessonId,
        completedAt: new Date(),
      })),
    });
    console.log(
      `  ✔ enrollment ${enrollment.id.slice(-6)} (2 / ${createdLessons.length} lessons complete)`
    );

    // --- Blog demo ---
    const acmeOwnerId = usersByEmail.get("owner@buildery.test");
    await prisma.blogPost.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.blogCategory.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.blogTag.deleteMany({ where: { workspaceId: acmeId } });

    const catUpdates = await prisma.blogCategory.create({
      data: { workspaceId: acmeId, name: "Updates", slug: "updates" },
    });
    const catTutorials = await prisma.blogCategory.create({
      data: { workspaceId: acmeId, name: "Tutorials", slug: "tutorials" },
    });

    async function createTag(name: string, slug: string) {
      return prisma.blogTag.create({
        data: { workspaceId: acmeId!, name, slug },
      });
    }
    const tagDesign = await createTag("design", "design");
    const tagRelease = await createTag("release", "release");
    const tagGuide = await createTag("guide", "guide");

    await prisma.blogPost.create({
      data: {
        workspaceId: acmeId,
        authorId: acmeOwnerId ?? null,
        categoryId: catUpdates.id,
        title: "Welcome to Acme Studio",
        slug: "welcome-to-acme-studio",
        excerpt:
          "Our journal — design notes, product updates, and a little bit of behind-the-scenes.",
        body: "We're starting a blog.\n\nExpect short, useful posts about how we build the Acme product, why we make the decisions we do, and the small details that add up to a calm, fast experience.\n\nThanks for stopping by.",
        status: "PUBLISHED",
        publishedAt: new Date(),
        tags: { connect: [{ id: tagRelease.id }] },
      },
    });
    await prisma.blogPost.create({
      data: {
        workspaceId: acmeId,
        authorId: acmeOwnerId ?? null,
        categoryId: catTutorials.id,
        title: "How we structure landing pages",
        slug: "how-we-structure-landing-pages",
        excerpt:
          "Hero → features → social proof → pricing → FAQ → CTA. Why that order works.",
        body: "Most landing pages follow the same rhythm, and that's fine — it works.\n\nThe goal is to remove friction. Visitors scan the page, understand what you do, build trust, see a price, get their questions answered, and then act. Each block does one job.\n\nWhen you start mixing those jobs into one block, the page gets noisier and conversion drops.",
        status: "PUBLISHED",
        publishedAt: new Date(),
        tags: { connect: [{ id: tagDesign.id }, { id: tagGuide.id }] },
      },
    });
    await prisma.blogPost.create({
      data: {
        workspaceId: acmeId,
        authorId: acmeOwnerId ?? null,
        categoryId: catUpdates.id,
        title: "Roadmap notes",
        slug: "roadmap-notes",
        excerpt: "Rough notes on what we're working on next.",
        body: "Still gathering thoughts here — this post stays a draft until we're ready.",
        status: "DRAFT",
      },
    });
    console.log("  ✔ blog: 2 categories, 3 tags, 3 posts (2 published, 1 draft)");

    // --- Form demo ---
    await prisma.form.deleteMany({ where: { workspaceId: acmeId } });

    const contactForm = await prisma.form.create({
      data: {
        workspaceId: acmeId,
        slug: "contact",
        title: "Contact us",
        description: "Drop us a line — we'll get back within a day or two.",
        successMessage: "Thanks! We'll reply to the email you provided.",
        submitLabel: "Send message",
        fields: {
          create: [
            {
              order: 0,
              label: "Full name",
              name: "full_name",
              type: "TEXT",
              required: true,
              placeholder: "Jane Doe",
            },
            {
              order: 1,
              label: "Email",
              name: "email",
              type: "EMAIL",
              required: true,
              placeholder: "jane@example.com",
            },
            {
              order: 2,
              label: "Topic",
              name: "topic",
              type: "SELECT",
              required: true,
              options: ["Sales", "Support", "Press", "Other"],
            },
            {
              order: 3,
              label: "Message",
              name: "message",
              type: "TEXTAREA",
              required: true,
              placeholder: "How can we help?",
            },
            {
              order: 4,
              label: "I agree to be contacted by email",
              name: "agree",
              type: "CHECKBOX",
              required: true,
            },
          ],
        },
      },
      include: { fields: { orderBy: { order: "asc" } } },
    });

    const contactVersion = await prisma.formVersion.create({
      data: {
        formId: contactForm.id,
        version: 1,
        title: contactForm.title,
        slug: contactForm.slug,
        description: contactForm.description,
        successMessage: contactForm.successMessage,
        submitLabel: contactForm.submitLabel,
        multiStep: contactForm.multiStep,
        notifyEmail: contactForm.notifyEmail,
        webhookUrl: contactForm.webhookUrl,
        redirectUrl: contactForm.redirectUrl,
        opensAt: contactForm.opensAt,
        closesAt: contactForm.closesAt,
        maxSubmissions: contactForm.maxSubmissions,
        closedMessage: contactForm.closedMessage,
        fields: snapshotFormFields(contactForm.fields),
      },
    });
    await prisma.form.update({
      where: { id: contactForm.id },
      data: {
        status: "PUBLISHED",
        isOpen: true,
        publishedSlug: contactForm.slug,
        publishedVersion: 1,
        publishedAt: new Date(),
      },
    });

    await prisma.formSubmission.createMany({
      data: [
        {
          formId: contactForm.id,
          formVersionId: contactVersion.id,
          workspaceId: acmeId,
          data: {
            full_name: "Siti Rahma",
            email: "siti@example.com",
            topic: "Sales",
            message: "Hi! Interested in the agency plan — please reach out.",
            agree: true,
          },
        },
        {
          formId: contactForm.id,
          formVersionId: contactVersion.id,
          workspaceId: acmeId,
          data: {
            full_name: "Ahmad Yusuf",
            email: "ahmad@example.com",
            topic: "Support",
            message:
              "I'm seeing a weird issue when changing the workspace slug. Happy to share details.",
            agree: true,
          },
        },
      ],
    });
    console.log("  ✔ form: 1 form with 5 fields, 2 sample submissions");

    // --- Affiliate / coupon / membership demo (Part 8) ---
    await prisma.commission.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.referral.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.affiliate.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.affiliateProgram.deleteMany({
      where: { workspaceId: acmeId },
    });
    await prisma.coupon.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.customerMembership.deleteMany({
      where: { workspaceId: acmeId },
    });
    await prisma.membershipPlan.deleteMany({ where: { workspaceId: acmeId } });

    const program = await prisma.affiliateProgram.create({
      data: {
        workspaceId: acmeId,
        name: "Acme Studio Affiliates",
        description:
          "Refer a friend and earn 25% of every order they place in their first 30 days.",
        commissionPercent: 25,
        isOpen: true,
      },
    });

    // Two affiliates — Budi (existing customer) and a fresh one.
    const novaCustomer = await prisma.customer.create({
      data: {
        workspaceId: acmeId,
        name: "Nova Pratama",
        email: "nova@example.com",
        phone: "0813-2222-3333",
      },
    });

    const budiAff = await prisma.affiliate.create({
      data: {
        programId: program.id,
        workspaceId: acmeId,
        customerId: customer.id,
        referralCode: "BUDI",
      },
    });
    const novaAff = await prisma.affiliate.create({
      data: {
        programId: program.id,
        workspaceId: acmeId,
        customerId: novaCustomer.id,
        referralCode: "NOVA",
      },
    });

    // Realistic click history for both affiliates over the last 14 days.
    const clickEvents: Prisma.ReferralCreateManyInput[] = [];
    function spreadClicks(affiliateId: string, count: number) {
      for (let i = 0; i < count; i++) {
        const created = new Date(
          Date.now() -
            Math.floor(Math.random() * 14) * 86_400_000 -
            Math.floor(Math.random() * 86_400_000)
        );
        clickEvents.push({
          affiliateId,
          workspaceId: acmeId!,
          event: "CLICK",
          createdAt: created,
        });
      }
    }
    spreadClicks(budiAff.id, 38);
    spreadClicks(novaAff.id, 22);
    await prisma.referral.createMany({ data: clickEvents });

    // A sample LEAD for Budi.
    await prisma.referral.create({
      data: {
        affiliateId: budiAff.id,
        workspaceId: acmeId,
        event: "LEAD",
      },
    });

    // A sample SALE + commission tied to the demo order.
    const demoOrder = await prisma.order.findUnique({
      where: {
        workspaceId_orderNumber: {
          workspaceId: acmeId,
          orderNumber: "ORD-DEMO01",
        },
      },
      select: { id: true, total: true },
    });
    if (demoOrder) {
      await prisma.referral.create({
        data: {
          affiliateId: budiAff.id,
          workspaceId: acmeId,
          orderId: demoOrder.id,
          event: "SALE",
        },
      });
      await prisma.commission.create({
        data: {
          affiliateId: budiAff.id,
          workspaceId: acmeId,
          orderId: demoOrder.id,
          amount: Math.floor((demoOrder.total * 25) / 100),
          percent: 25,
          status: "APPROVED",
        },
      });
    }
    console.log(
      `  ✔ affiliate program with 2 affiliates (BUDI, NOVA) + sample commission`
    );

    // Coupons — one percentage, one fixed.
    await prisma.coupon.createMany({
      data: [
        {
          workspaceId: acmeId,
          code: "LAUNCH20",
          type: "PERCENTAGE",
          value: 20,
          maxUses: 100,
          isActive: true,
        },
        {
          workspaceId: acmeId,
          code: "SAVE50K",
          type: "FIXED",
          value: 50_000,
          maxUses: null,
          isActive: true,
        },
      ],
    });
    console.log("  ✔ 2 coupons (LAUNCH20, SAVE50K)");

    // Membership plans + one customer member.
    const planFree = await prisma.membershipPlan.create({
      data: {
        workspaceId: acmeId,
        name: "Community",
        slug: "community",
        description: "Free tier — sign up to follow updates.",
        level: "FREE",
        price: 0,
      },
    });
    void planFree;
    const planBasic = await prisma.membershipPlan.create({
      data: {
        workspaceId: acmeId,
        name: "Basic",
        slug: "basic",
        description: "Access to weekly newsletters and the discussion board.",
        level: "BASIC",
        price: 79_000,
      },
    });
    void planBasic;
    const planPremium = await prisma.membershipPlan.create({
      data: {
        workspaceId: acmeId,
        name: "Premium",
        slug: "premium",
        description: "Everything in Basic plus paid courses and 1:1 reviews.",
        level: "PREMIUM",
        price: 199_000,
      },
    });

    await prisma.customerMembership.create({
      data: {
        workspaceId: acmeId,
        customerId: customer.id, // Budi
        planId: planPremium.id,
      },
    });
    console.log(
      "  ✔ 3 membership plans (Community, Basic, Premium) + 1 PREMIUM member (Budi)"
    );

    // --- Integration placeholders (Part 9) ---
    await prisma.integrationSetting.upsert({
      where: { workspaceId: acmeId },
      update: {
        metaPixelId: null,
        googleAnalyticsId: null,
        googleTagManagerId: null,
        googleSearchConsoleVerification: null,
        customHeadScript: null,
      },
      create: { workspaceId: acmeId },
    });
    console.log("  ✔ integration setting (empty placeholder)");

    // --- Sample abuse report (Part 10) ---
    await prisma.abuseReport.deleteMany({ where: { workspaceId: acmeId } });
    await prisma.abuseReport.create({
      data: {
        workspaceId: acmeId,
        reporterEmail: "watchdog@example.com",
        reason:
          "A blog post on this workspace appears to contain scraped content. Please review.",
        status: "OPEN",
      },
    });
    console.log("  ✔ 1 sample abuse report (OPEN)");

    // Make Acme Studio the most-recent membership for its owner, so logging
    // in as owner@buildery.test lands in the workspace that has the demo page.
    const ownerId = usersByEmail.get("owner@buildery.test");
    if (ownerId) {
      await prisma.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: acmeId, userId: ownerId },
        },
        data: { updatedAt: new Date() },
      });
    }
  }

  console.log("\nDone. Default password for all demo users: Password123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
