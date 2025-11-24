const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const APPLICATION_ID = 'cmhukf24w0000lh0468l9xojj';
const ASSIGNEE_ID = 'cmhnuwcev0001ii04wz7es15b';

// Login first to get token
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    return response.data.token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createTask(token, taskData) {
  try {
    const response = await axios.post(
      `${BASE_URL}/applications/${APPLICATION_ID}/due-diligence/assign-task`,
      taskData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log(`✅ Created task: ${taskData.title}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create task "${taskData.title}":`, error.response?.data?.message || error.message);
  }
}

async function createAllTasks() {
  console.log('🔐 Logging in...\n');
  const token = await login();
  console.log('✅ Login successful!\n');

  const tasks = [
    {
      title: "Market Research Analysis",
      description: "Analyze market size, competition, growth potential, and target audience for Machips",
      category: "Market Research"
    },
    {
      title: "Competitive Analysis",
      description: "Evaluate competitive landscape, unique value proposition, and market positioning",
      category: "Competitive Analysis"
    },
    {
      title: "Management Team Evaluation",
      description: "Assess management team qualifications, experience, and capability to execute business plan",
      category: "Management Team Evaluation"
    },
    {
      title: "Legal Compliance Review",
      description: "Verify all legal documents, registrations, licenses, and regulatory compliance",
      category: "Legal Compliance"
    },
    {
      title: "Risk Assessment",
      description: "Identify and evaluate business risks, mitigation strategies, and overall risk tolerance",
      category: "Risk Assessment"
    }
  ];

  console.log(`📋 Creating ${tasks.length} tasks for Machips application...\n`);

  for (const task of tasks) {
    const taskData = {
      assigneeId: ASSIGNEE_ID,
      title: task.title,
      description: task.description,
      priority: "high",
      dueDate: "2025-11-21T08:22:33.138Z",
      category: task.category
    };
    
    await createTask(token, taskData);
  }

  console.log('\n🎉 All tasks created successfully!');
  console.log('\n📌 Next steps:');
  console.log('1. Update due diligence assessment for all 6 areas');
  console.log('2. Complete due diligence with final recommendation');
}

createAllTasks().catch(error => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});


