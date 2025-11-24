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

async function getExistingTasks(token) {
  try {
    const response = await axios.get(
      `${BASE_URL}/applications/${APPLICATION_ID}/due-diligence`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract tasks from the response
    const dueDiligence = response.data.data;
    return dueDiligence?.tasks || [];
  } catch (error) {
    console.error('❌ Failed to get due diligence:', error.response?.data?.message || error.message);
    return [];
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
    console.log(`✅ Created task: ${taskData.title} [${taskData.category}]`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to create task "${taskData.title}":`, error.response?.data?.message || error.message);
  }
}

async function createAllTasks() {
  console.log('🔐 Logging in...\n');
  const token = await login();
  console.log('✅ Login successful!\n');

  // Check for existing tasks
  console.log('🔍 Checking for existing tasks...\n');
  const existingTasks = await getExistingTasks(token);
  
  if (existingTasks.length > 0) {
    console.log(`📋 Found ${existingTasks.length} existing task(s):`);
    existingTasks.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title} - Category: ${task.category || 'N/A'}`);
    });
    console.log('\n');
  } else {
    console.log('✅ No existing tasks found.\n');
  }

  // Get categories that already have tasks
  const existingCategories = existingTasks
    .filter(task => task.category)
    .map(task => task.category);

  // Define all required tasks
  const allTasks = [
    {
      title: "Market Research Analysis",
      description: "Analyze market size, competition, growth potential, and target audience for Machips",
      category: "Market Research"
    },
    {
      title: "Financial Assessment",
      description: "Review financial statements, cash flow projections, and revenue models",
      category: "Financial Assessment"
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

  // Filter out tasks for categories that already exist
  const tasksToCreate = allTasks.filter(task => !existingCategories.includes(task.category));

  if (tasksToCreate.length === 0) {
    console.log('✅ All due diligence areas already have tasks assigned!');
    console.log('\n📌 Next steps:');
    console.log('1. Update due diligence assessment for all 6 areas (PUT /applications/{id}/due-diligence)');
    console.log('2. Complete due diligence with final recommendation (POST /applications/{id}/due-diligence/complete)');
    return;
  }

  console.log(`📋 Creating ${tasksToCreate.length} task(s) for missing areas...\n`);

  for (const task of tasksToCreate) {
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

  console.log('\n🎉 All missing tasks created successfully!');
  console.log('\n📌 Next steps:');
  console.log('1. Update due diligence assessment for all 6 areas (PUT /applications/{id}/due-diligence)');
  console.log('2. Complete due diligence with final recommendation (POST /applications/{id}/due-diligence/complete)');
}

createAllTasks().catch(error => {
  console.error('❌ Script failed:', error.message);
  process.exit(1);
});


