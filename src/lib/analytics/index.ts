import { prisma } from '../db';
import { ACTIVE_STATUSES } from '../bookings/state-machine';

/**
 * Admin analytics.
 *
 * Every number here is derived from real rows. Where a metric cannot be
 * computed yet (no completed bookings, so no average order value) it returns
 * null and the dashboard renders an empty state rather than a zero that looks
 * like a real measurement.
 *
 * Queries are written to avoid N+1: aggregates use groupBy, and the time series
 * uses a single raw query with a generated date spine so days with no bookings
 * still appear.
 */

const startOfToday = (): Date => {
  // Report days are Pakistan days, not UTC days; PKT is UTC+5 year-round.
  const now = new Date();
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  pkt.setUTCHours(0, 0, 0, 0);
  return new Date(pkt.getTime() - 5 * 60 * 60 * 1000);
};

const daysAgo = (days: number): Date => new Date(startOfToday().getTime() - days * 86_400_000);

export interface OverviewMetrics {
  users: { total: number; customers: number; providers: number; newThisWeek: number };
  providers: {
    total: number;
    verified: number;
    pendingVerification: number;
    suspended: number;
  };
  bookings: {
    total: number;
    active: number;
    today: number;
    completedToday: number;
    cancelledToday: number;
    completedThisMonth: number;
  };
  revenue: {
    todayGrossPaisa: number;
    todayCommissionPaisa: number;
    monthGrossPaisa: number;
    monthCommissionPaisa: number;
    /** Null until at least one booking has completed. */
    averageOrderValuePaisa: number | null;
  };
  quality: {
    averageRating: number | null;
    ratingCount: number;
    openDisputes: number;
    openGuaranteeClaims: number;
    disputeRate: number | null;
    cancellationRate: number | null;
    noShowRate: number | null;
    providerResponseRate: number | null;
  };
  queues: { pendingProviders: number; unassignedBookings: number; openTickets: number };
}

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const today = startOfToday();
  const weekAgo = daysAgo(7);
  const monthStart = daysAgo(30);

  const [
    userCounts,
    newUsersThisWeek,
    providerCounts,
    bookingTotal,
    activeBookings,
    todayBookings,
    todayCompleted,
    todayCancelled,
    monthCompleted,
    todayRevenue,
    monthRevenue,
    completedAggregate,
    ratingAggregate,
    openDisputes,
    openClaims,
    disputeTotal,
    cancelledTotal,
    noShowTotal,
    offerStats,
    pendingProviders,
    unassignedBookings,
    openTickets,
  ] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.providerProfile.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.booking.count({ where: { deletedAt: null } }),
    prisma.booking.count({ where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } } }),
    prisma.booking.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
    prisma.booking.count({
      where: { deletedAt: null, status: 'COMPLETED', completedAt: { gte: today } },
    }),
    prisma.booking.count({
      where: { deletedAt: null, status: 'CANCELLED', cancelledAt: { gte: today } },
    }),
    prisma.booking.count({
      where: { deletedAt: null, status: 'COMPLETED', completedAt: { gte: monthStart } },
    }),
    prisma.booking.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: today } },
      _sum: { finalTotalPaisa: true, commissionPaisa: true },
    }),
    prisma.booking.aggregate({
      where: { status: 'COMPLETED', completedAt: { gte: monthStart } },
      _sum: { finalTotalPaisa: true, commissionPaisa: true },
    }),
    prisma.booking.aggregate({
      where: { status: 'COMPLETED' },
      _avg: { finalTotalPaisa: true },
      _count: { _all: true },
    }),
    prisma.review.aggregate({
      where: { isPublished: true, rating: { gt: 0 } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.dispute.count({
      where: { status: { in: ['OPEN', 'UNDER_REVIEW', 'AWAITING_CUSTOMER', 'AWAITING_PROVIDER'] } },
    }),
    prisma.guaranteeClaim.count({
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REVISIT_SCHEDULED'] } },
    }),
    prisma.dispute.count(),
    prisma.booking.count({ where: { status: 'CANCELLED', deletedAt: null } }),
    prisma.providerProfile.aggregate({ _sum: { noShowJobs: true } }),
    prisma.bookingOffer.aggregate({
      _count: { _all: true },
      // Rows with a response, over all rows, is the platform response rate.
      where: {},
    }),
    prisma.providerProfile.count({ where: { status: 'PENDING_VERIFICATION', deletedAt: null } }),
    prisma.booking.count({ where: { status: 'PENDING', providerId: null, deletedAt: null } }),
    prisma.supportTicket.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER'] } },
    }),
  ]);

  const respondedOffers = await prisma.bookingOffer.count({
    where: { respondedAt: { not: null } },
  });

  const roleCount = (role: string) => userCounts.find((row) => row.role === role)?._count._all ?? 0;
  const providerStatusCount = (status: string) =>
    providerCounts.find((row) => row.status === status)?._count._all ?? 0;

  const totalUsers = userCounts.reduce((sum, row) => sum + row._count._all, 0);
  const completedCount = completedAggregate._count._all;
  const totalOffers = offerStats._count._all;

  return {
    users: {
      total: totalUsers,
      customers: roleCount('CUSTOMER'),
      providers: roleCount('PROVIDER'),
      newThisWeek: newUsersThisWeek,
    },
    providers: {
      total: providerCounts.reduce((sum, row) => sum + row._count._all, 0),
      verified: providerStatusCount('VERIFIED'),
      pendingVerification: providerStatusCount('PENDING_VERIFICATION'),
      suspended: providerStatusCount('SUSPENDED'),
    },
    bookings: {
      total: bookingTotal,
      active: activeBookings,
      today: todayBookings,
      completedToday: todayCompleted,
      cancelledToday: todayCancelled,
      completedThisMonth: monthCompleted,
    },
    revenue: {
      todayGrossPaisa: todayRevenue._sum.finalTotalPaisa ?? 0,
      todayCommissionPaisa: todayRevenue._sum.commissionPaisa ?? 0,
      monthGrossPaisa: monthRevenue._sum.finalTotalPaisa ?? 0,
      monthCommissionPaisa: monthRevenue._sum.commissionPaisa ?? 0,
      averageOrderValuePaisa:
        completedCount > 0 ? Math.round(completedAggregate._avg.finalTotalPaisa ?? 0) : null,
    },
    quality: {
      averageRating: ratingAggregate._avg.rating
        ? Math.round(ratingAggregate._avg.rating * 100) / 100
        : null,
      ratingCount: ratingAggregate._count._all,
      openDisputes,
      openGuaranteeClaims: openClaims,
      disputeRate: bookingTotal > 0 ? round4(disputeTotal / bookingTotal) : null,
      cancellationRate: bookingTotal > 0 ? round4(cancelledTotal / bookingTotal) : null,
      noShowRate:
        completedCount + cancelledTotal > 0
          ? round4((noShowTotal._sum.noShowJobs ?? 0) / (completedCount + cancelledTotal))
          : null,
      providerResponseRate: totalOffers > 0 ? round4(respondedOffers / totalOffers) : null,
    },
    queues: { pendingProviders, unassignedBookings, openTickets },
  };
}

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

export interface TimeSeriesPoint {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  grossPaisa: number;
  commissionPaisa: number;
}

/**
 * Daily series over the last N days.
 *
 * A generated date spine (`generate_series`) left-joined against bookings keeps
 * zero-days in the result — otherwise the chart silently compresses quiet days
 * and misleads.
 */
export async function getDailySeries(days = 30): Promise<TimeSeriesPoint[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      date: Date;
      bookings: bigint;
      completed: bigint;
      cancelled: bigint;
      gross: bigint | null;
      commission: bigint | null;
    }>
  >`
    WITH spine AS (
      SELECT generate_series(
        date_trunc('day', now() AT TIME ZONE 'Asia/Karachi') - make_interval(days => ${days - 1}::int),
        date_trunc('day', now() AT TIME ZONE 'Asia/Karachi'),
        interval '1 day'
      )::date AS date
    )
    SELECT
      spine.date,
      count(b.id) AS bookings,
      count(b.id) FILTER (WHERE b."status" = 'COMPLETED') AS completed,
      count(b.id) FILTER (WHERE b."status" = 'CANCELLED') AS cancelled,
      coalesce(sum(b."finalTotalPaisa") FILTER (WHERE b."status" = 'COMPLETED'), 0) AS gross,
      coalesce(sum(b."commissionPaisa") FILTER (WHERE b."status" = 'COMPLETED'), 0) AS commission
    FROM spine
    LEFT JOIN "Booking" b
      ON (b."createdAt" AT TIME ZONE 'Asia/Karachi')::date = spine.date
      AND b."deletedAt" IS NULL
    GROUP BY spine.date
    ORDER BY spine.date ASC
  `;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    bookings: Number(row.bookings),
    completed: Number(row.completed),
    cancelled: Number(row.cancelled),
    grossPaisa: Number(row.gross ?? 0),
    commissionPaisa: Number(row.commission ?? 0),
  }));
}

export interface CategoryBreakdown {
  categoryName: string;
  categorySlug: string;
  bookings: number;
  completed: number;
  grossPaisa: number;
}

export async function getCategoryBreakdown(days = 30): Promise<CategoryBreakdown[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      name: string;
      slug: string;
      bookings: bigint;
      completed: bigint;
      gross: bigint | null;
    }>
  >`
    SELECT
      c."name",
      c."slug",
      count(b.id) AS bookings,
      count(b.id) FILTER (WHERE b."status" = 'COMPLETED') AS completed,
      coalesce(sum(b."finalTotalPaisa") FILTER (WHERE b."status" = 'COMPLETED'), 0) AS gross
    FROM "Booking" b
    JOIN "Service" s ON s.id = b."serviceId"
    JOIN "ServiceCategory" c ON c.id = s."categoryId"
    WHERE b."deletedAt" IS NULL
      AND b."createdAt" >= now() - make_interval(days => ${days}::int)
    GROUP BY c."name", c."slug"
    ORDER BY bookings DESC
  `;

  return rows.map((row) => ({
    categoryName: row.name,
    categorySlug: row.slug,
    bookings: Number(row.bookings),
    completed: Number(row.completed),
    grossPaisa: Number(row.gross ?? 0),
  }));
}

export interface ZoneBreakdown {
  zoneName: string;
  bookings: number;
  grossPaisa: number;
}

export async function getZoneBreakdown(days = 30): Promise<ZoneBreakdown[]> {
  const rows = await prisma.$queryRaw<
    Array<{ name: string | null; bookings: bigint; gross: bigint | null }>
  >`
    SELECT
      z."name",
      count(b.id) AS bookings,
      coalesce(sum(b."finalTotalPaisa") FILTER (WHERE b."status" = 'COMPLETED'), 0) AS gross
    FROM "Booking" b
    JOIN "Address" a ON a.id = b."addressId"
    LEFT JOIN "ServiceZone" z ON z.id = a."zoneId"
    WHERE b."deletedAt" IS NULL
      AND b."createdAt" >= now() - make_interval(days => ${days}::int)
    GROUP BY z."name"
    ORDER BY bookings DESC
    LIMIT 15
  `;

  return rows.map((row) => ({
    zoneName: row.name ?? 'Area not set',
    bookings: Number(row.bookings),
    grossPaisa: Number(row.gross ?? 0),
  }));
}

export interface ProviderPerformanceRow {
  providerId: string;
  businessName: string;
  completedJobs: number;
  cancelledJobs: number;
  ratingAverage: number | null;
  ratingCount: number;
  responseRate: number;
  avgResponseMinutes: number | null;
  grossPaisa: number;
  earningsPaisa: number;
}

export async function getProviderPerformance(limit = 20): Promise<ProviderPerformanceRow[]> {
  const providers = await prisma.providerProfile.findMany({
    where: { deletedAt: null, status: 'VERIFIED' },
    orderBy: [{ completedJobs: 'desc' }],
    take: limit,
    select: {
      id: true,
      businessName: true,
      completedJobs: true,
      cancelledJobs: true,
      ratingAverage: true,
      ratingCount: true,
      responseRate: true,
      avgResponseMinutes: true,
    },
  });

  // One grouped query for the money, rather than one per provider.
  const totals = await prisma.booking.groupBy({
    by: ['providerId'],
    where: { status: 'COMPLETED', providerId: { in: providers.map((p) => p.id) } },
    _sum: { finalTotalPaisa: true, providerEarningsPaisa: true },
  });
  const totalsByProvider = new Map(totals.map((row) => [row.providerId, row._sum]));

  return providers.map((provider) => ({
    providerId: provider.id,
    businessName: provider.businessName,
    completedJobs: provider.completedJobs,
    cancelledJobs: provider.cancelledJobs,
    ratingAverage: provider.ratingAverage,
    ratingCount: provider.ratingCount,
    responseRate: provider.responseRate,
    avgResponseMinutes: provider.avgResponseMinutes,
    grossPaisa: totalsByProvider.get(provider.id)?.finalTotalPaisa ?? 0,
    earningsPaisa: totalsByProvider.get(provider.id)?.providerEarningsPaisa ?? 0,
  }));
}

export interface RetentionMetrics {
  totalCustomers: number;
  repeatCustomers: number;
  repeatRate: number | null;
  /** Customers with a completed booking in the last 30 days. */
  activeCustomers: number;
}

export async function getRetentionMetrics(): Promise<RetentionMetrics> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint; repeat: bigint; active: bigint }>>`
    WITH per_customer AS (
      SELECT
        "customerId",
        count(*) AS bookings,
        max("completedAt") AS last_completed
      FROM "Booking"
      WHERE "deletedAt" IS NULL AND "status" = 'COMPLETED'
      GROUP BY "customerId"
    )
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE bookings > 1) AS repeat,
      count(*) FILTER (WHERE last_completed >= now() - interval '30 days') AS active
    FROM per_customer
  `;

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  const repeat = Number(row?.repeat ?? 0);
  return {
    totalCustomers: total,
    repeatCustomers: repeat,
    repeatRate: total > 0 ? round4(repeat / total) : null,
    activeCustomers: Number(row?.active ?? 0),
  };
}

/** Provider earnings summary for the provider's own dashboard. */
export async function getProviderEarnings(providerId: string) {
  const today = startOfToday();
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);

  const [todayAgg, weekAgg, monthAgg, allTimeAgg, pendingPayout, completedCount] =
    await Promise.all([
      prisma.booking.aggregate({
        where: { providerId, status: 'COMPLETED', completedAt: { gte: today } },
        _sum: { providerEarningsPaisa: true, commissionPaisa: true, finalTotalPaisa: true },
        _count: { _all: true },
      }),
      prisma.booking.aggregate({
        where: { providerId, status: 'COMPLETED', completedAt: { gte: weekStart } },
        _sum: { providerEarningsPaisa: true },
        _count: { _all: true },
      }),
      prisma.booking.aggregate({
        where: { providerId, status: 'COMPLETED', completedAt: { gte: monthStart } },
        _sum: { providerEarningsPaisa: true, commissionPaisa: true },
        _count: { _all: true },
      }),
      prisma.booking.aggregate({
        where: { providerId, status: 'COMPLETED' },
        _sum: { providerEarningsPaisa: true, commissionPaisa: true, finalTotalPaisa: true },
        _count: { _all: true },
      }),
      // Earnings on completed jobs not yet included in any payout record.
      prisma.booking.aggregate({
        where: { providerId, status: 'COMPLETED', payoutItems: { none: {} } },
        _sum: { providerEarningsPaisa: true },
        _count: { _all: true },
      }),
      prisma.booking.count({ where: { providerId, status: 'COMPLETED' } }),
    ]);

  return {
    today: {
      earningsPaisa: todayAgg._sum.providerEarningsPaisa ?? 0,
      jobs: todayAgg._count._all,
    },
    week: {
      earningsPaisa: weekAgg._sum.providerEarningsPaisa ?? 0,
      jobs: weekAgg._count._all,
    },
    month: {
      earningsPaisa: monthAgg._sum.providerEarningsPaisa ?? 0,
      commissionPaisa: monthAgg._sum.commissionPaisa ?? 0,
      jobs: monthAgg._count._all,
    },
    allTime: {
      earningsPaisa: allTimeAgg._sum.providerEarningsPaisa ?? 0,
      commissionPaisa: allTimeAgg._sum.commissionPaisa ?? 0,
      grossPaisa: allTimeAgg._sum.finalTotalPaisa ?? 0,
      jobs: completedCount,
    },
    pendingPayout: {
      earningsPaisa: pendingPayout._sum.providerEarningsPaisa ?? 0,
      jobs: pendingPayout._count._all,
    },
  };
}
