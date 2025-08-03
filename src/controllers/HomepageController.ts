import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

const prisma = dbConnection.getPrismaClient();

// Helper function to get relative time
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
}

export const homepageController = {
  // Get all homepage data
  async getHomepageData(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });

      // Get all data in parallel for better performance
      const [
        posts,
        newsletters,
        upcomingEvents,
        allEvents,
        onlineUsers
      ] = await Promise.all([
        // Get active posts (not expired)
        prisma.post.findMany({
          where: {
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        // Get active newsletters
        prisma.newsletter.findMany({
          where: { isActive: true },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }),

        // Get upcoming events (start date >= current date)
        prisma.event.findMany({
          where: {
            isActive: true,
            startDate: { gte: new Date() }
          },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { startDate: 'asc' }
        }),

        // Get all active events (regardless of date)
        prisma.event.findMany({
          where: { isActive: true },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { startDate: 'asc' }
        }),

        // Get online users (active in last 5 minutes)
        prisma.user.findMany({
          where: {
            lastSeen: {
              gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
            }
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lastSeen: true
          },
          orderBy: { lastSeen: 'desc' }
        })
      ]);

      // Calculate summary statistics
      const summary = {
        totalPosts: posts.length,
        totalNewsletters: newsletters.length,
        upcomingEvents: upcomingEvents.length,
        totalEvents: allEvents.length,
        onlineUsers: onlineUsers.length
      };

      res.status(200).json({
        success: true,
        data: {
          posts,
          newsletters,
          events: {
            upcoming: upcomingEvents,
            all: allEvents
          },
          onlineUsers,
          summary
        }
      });
    } catch (error: any) {
      console.error("Error fetching homepage data:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get online activity (for the online activity widget)
  async getOnlineActivity(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });

      // Get all users with their last seen time
      const users = await prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          lastSeen: true
        },
        orderBy: { lastSeen: 'desc' }
      });

      // Add online status (active in last 5 minutes)
      const usersWithStatus = users.map(user => ({
        ...user,
        isOnline: user.lastSeen >= new Date(Date.now() - 5 * 60 * 1000)
      }));

      res.status(200).json({
        success: true,
        data: usersWithStatus
      });
    } catch (error: any) {
      console.error("Error fetching online activity:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get user's notifications
  async getUserNotifications(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;

      console.log(`🔍 Fetching notifications for user: ${userId}`);

      // Get notifications with pagination
      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset)
      });

      console.log(`📊 Found ${notifications.length} notifications for user ${userId}`);

      // Get total count for pagination
      const totalCount = await prisma.notification.count({
        where: { userId }
      });

      // Get unread count
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      console.log(`📈 Total notifications: ${totalCount}, Unread: ${unreadCount}`);

      // Format notifications with better structure
      const formattedNotifications = notifications.map(notification => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        data: notification.data,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
        // Add relative time for better UX
        timeAgo: getTimeAgo(notification.createdAt)
      }));

      res.status(200).json({
        success: true,
        data: {
          notifications: formattedNotifications,
          pagination: {
            total: totalCount,
            unread: unreadCount,
            limit: Number(limit),
            offset: Number(offset),
            hasMore: Number(offset) + Number(limit) < totalCount
          }
        }
      });
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Mark notification as read
  async markNotificationAsRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const notification = await prisma.notification.findFirst({
        where: {
          id,
          userId
        }
      });

      if (!notification) {
        res.status(404).json({
          success: false,
          message: "Notification not found"
        });
        return;
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      res.status(200).json({
        success: true,
        message: "Notification marked as read"
      });
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Mark all notifications as read
  async markAllNotificationsAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: { isRead: true }
      });

      res.status(200).json({
        success: true,
        message: "All notifications marked as read"
      });
    } catch (error: any) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Debug endpoint to check all notifications (admin only)
  async getAllNotificationsDebug(req: AuthRequest, res: Response) {
    try {
      // Check if user is admin
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { role: true }
      });

      if (!user || user.role.name !== 'admin') {
        res.status(403).json({
          success: false,
          message: "Access denied. Admin only."
        });
        return;
      }

      const allNotifications = await prisma.notification.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const totalCount = await prisma.notification.count();
      const unreadCount = await prisma.notification.count({
        where: { isRead: false }
      });

      res.status(200).json({
        success: true,
        data: {
          notifications: allNotifications,
          summary: {
            total: totalCount,
            unread: unreadCount
          }
        }
      });
    } catch (error: any) {
      console.error("Error fetching all notifications:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}; 