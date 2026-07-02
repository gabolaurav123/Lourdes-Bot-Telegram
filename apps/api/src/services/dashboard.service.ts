import { prisma } from "../lib/prisma";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

class DashboardService {
  async stats() {
    const today = startOfToday();
    const [
      totalLeads,
      newToday,
      activeConversations,
      optIn,
      noOptIn,
      ageConfirmed,
      sentToday,
      receivedToday,
      aiToday,
      activeCampaigns,
      activeAutomations,
      purchasesToday,
      stopLeads,
      failedMessages
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: today } } }),
      prisma.conversation.count({ where: { conversationActive: true } }),
      prisma.lead.count({ where: { optInCommercial: true } }),
      prisma.lead.count({ where: { optInCommercial: false } }),
      prisma.lead.count({ where: { ageConfirmed: true } }),
      prisma.message.count({ where: { direction: "OUTBOUND", createdAt: { gte: today } } }),
      prisma.message.count({ where: { direction: "INBOUND", createdAt: { gte: today } } }),
      prisma.message.count({ where: { aiGenerated: true, createdAt: { gte: today } } }),
      prisma.campaign.count({ where: { status: "ACTIVE" } }),
      prisma.automation.count({ where: { status: "ACTIVE" } }),
      prisma.purchase.aggregate({
        where: { createdAt: { gte: today }, status: "CONFIRMADO" },
        _count: true,
        _sum: { amount: true }
      }),
      prisma.lead.count({ where: { status: "NO_VOLVER_A_ESCRIBIR" } }),
      prisma.message.count({ where: { status: "FAILED", createdAt: { gte: today } } })
    ]);

    return {
      totalLeads,
      newToday,
      activeConversations,
      optIn,
      noOptIn,
      ageConfirmed,
      sentToday,
      receivedToday,
      aiToday,
      activeCampaigns,
      activeAutomations,
      purchasesToday: purchasesToday._count,
      estimatedRevenue: purchasesToday._sum.amount ?? 0,
      stopLeads,
      failedMessages
    };
  }
}

export const dashboardService = new DashboardService();
