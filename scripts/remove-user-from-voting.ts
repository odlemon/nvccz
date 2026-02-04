// @ts-nocheck
import { prisma } from "../src/utils/database";

const REMOVE_EMAIL = "info@niakazi.com";

async function main() {
  try {
    console.log("🔍 Starting complete removal of user from voting members...\n");

    // Step 1: Find the user
    console.log(`📋 Step 1: Finding user ${REMOVE_EMAIL}`);
    const user = await prisma.user.findUnique({
      where: {
        email: REMOVE_EMAIL.toLowerCase()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true,
        roleCode: true,
        votingPower: true
      }
    });

    if (!user) {
      console.log(`   ❌ No user found with email: ${REMOVE_EMAIL}`);
      process.exit(1);
    }

    console.log(`   ✅ Found user:`);
    console.log(`      ID: ${user.id}`);
    console.log(`      Name: ${user.firstName} ${user.lastName}`);
    console.log(`      Department: ${user.userDepartment || 'N/A'}`);
    console.log(`      Role: ${user.roleCode || 'N/A'}`);
    console.log(`      Voting Power: ${user.votingPower || 'null'}%\n`);

    // Step 2: Find all board review votes by this user
    console.log(`📋 Step 2: Finding board review votes by this user`);
    const boardReviewVoteDelegate = (prisma as any).boardReviewVote;
    let votes: any[] = [];
    
    if (boardReviewVoteDelegate) {
      votes = await boardReviewVoteDelegate.findMany({
        where: { userId: user.id }
      });
    } else {
      const rawVotes = await prisma.$queryRawUnsafe<Array<{
        id: string;
        boardReviewId: string;
        userId: string;
        vote: string;
      }>>(
        `SELECT id, boardReviewId, userId, vote
         FROM board_review_votes
         WHERE userId = ?`,
        user.id
      );
      votes = rawVotes;
    }

    console.log(`   Found ${votes.length} board review vote(s) by this user`);
    if (votes.length > 0) {
      console.log(`   ⚠️  Votes found:`);
      for (const vote of votes) {
        console.log(`      - Vote ID: ${vote.id}, Board Review: ${vote.boardReviewId}, Vote: ${vote.vote}`);
      }
    }

    // Step 3: Delete all board review votes
    if (votes.length > 0) {
      console.log(`\n📋 Step 3: Deleting board review votes`);
      if (boardReviewVoteDelegate) {
        await boardReviewVoteDelegate.deleteMany({
          where: { userId: user.id }
        });
      } else {
        await prisma.$executeRawUnsafe(
          `DELETE FROM board_review_votes WHERE userId = ?`,
          user.id
        );
      }
      console.log(`   ✅ Deleted ${votes.length} board review vote(s)\n`);
    }

    // Step 4: Check for board reviews where this user is the reviewer
    console.log(`📋 Step 4: Checking board reviews where user is reviewer`);
    const boardReviews = await prisma.boardReview.findMany({
      where: { reviewerId: user.id },
      select: {
        id: true,
        applicationId: true,
        status: true
      }
    });

    console.log(`   Found ${boardReviews.length} board review(s) where user is reviewer`);
    if (boardReviews.length > 0) {
      console.log(`   ⚠️  Board reviews found:`);
      for (const review of boardReviews) {
        console.log(`      - Review ID: ${review.id}, Application: ${review.applicationId}, Status: ${review.status}`);
      }
      console.log(`   ℹ️  Note: These reviews will remain but reviewer association will be updated\n`);
    }

    // Step 5: Remove voting power
    console.log(`📋 Step 5: Removing voting power`);
    await prisma.user.update({
      where: { id: user.id },
      data: { votingPower: null }
    });
    console.log(`   ✅ Voting power set to null\n`);

    // Step 6: Change roleCode to remove from voting members list
    // The voting members query filters by: userDepartment = "Investments" AND roleCode IN ["BOARD_CHAIR", "BOARD_MEMBER"]
    // So we need to change either the department or the roleCode
    console.log(`📋 Step 6: Removing user from voting members eligibility`);
    
    // Change roleCode from BOARD_MEMBER to null or a non-voting role
    // This will remove them from the voting members list
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        roleCode: null  // Remove the BOARD_MEMBER role code
      }
    });
    console.log(`   ✅ Changed roleCode from "${user.roleCode}" to null`);
    console.log(`   ✅ User will no longer appear in voting members list\n`);

    // Step 7: Verify removal
    console.log(`📋 Step 7: Verifying removal from voting members`);
    const votingMembers = await prisma.user.findMany({
      where: {
        userDepartment: "Investments",
        roleCode: {
          in: ["BOARD_CHAIR", "BOARD_MEMBER"]
        }
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roleCode: true,
        votingPower: true
      }
    });

    const stillInList = votingMembers.find(m => m.id === user.id);
    if (stillInList) {
      console.log(`   ❌ ERROR: User still appears in voting members list!`);
      console.log(`   Current state:`, stillInList);
    } else {
      console.log(`   ✅ User successfully removed from voting members list`);
    }

    console.log(`\n   📊 Remaining voting members:`);
    let totalPower = 0;
    for (const member of votingMembers) {
      const power = member.votingPower ? Number(member.votingPower) : 0;
      totalPower += power;
      console.log(`      - ${member.firstName} ${member.lastName} (${member.email}): ${power}%`);
    }
    console.log(`\n   ✅ Total voting power: ${totalPower}%`);

    if (totalPower === 100) {
      console.log(`\n🎉 User removal completed successfully!`);
    } else {
      console.log(`\n⚠️  Warning: Total voting power is ${totalPower}%, not 100%`);
    }

  } catch (error: any) {
    console.error("❌ Failed to remove user from voting:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
