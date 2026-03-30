import { generateText, gateway } from "ai";
import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";

export const chatRoutes = new Hono();

chatRoutes.post("/chat", async (c) => {
  const { messages, context, message, ai_preferences, memories, conversation_id } = await c.req.json();

  // Support both formats: {messages: [...]} (new) or {message: "..."} (legacy)
  const chatMessages = messages || (message ? [{ role: "user", content: message }] : []);
  if (!chatMessages.length) return c.json({ error: "Message required" }, 400);

  const ctx = context || {};
  const today = new Date().toISOString().split("T")[0];
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Build member list with ages and allowance info
  const memberList = ctx.members?.map((m) => {
    let desc = `- ${m.name} (id: ${m.id}, ${m.points || 0}pts, level ${m.level || 1}`;
    if (m.birth_date) {
      const age = Math.floor((Date.now() - new Date(m.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      desc += `, age ${age}`;
    }
    if (m.allowance_balance) desc += `, $${parseFloat(m.allowance_balance).toFixed(2)} balance`;
    if (m.allowance_rate) desc += `, earns $${parseFloat(m.allowance_rate).toFixed(2)}/100pts`;
    if (m.streak_days) desc += `, ${m.streak_days}d streak`;
    desc += ")";
    return desc;
  }).join("\n") || "No members";

  // Build this week's events
  const weekEvents = ctx.events?.map((e) => {
    const time = e.allDay ? "All day" : `${e.start?.split("T")[1]?.slice(0, 5) || "?"}-${e.end?.split("T")[1]?.slice(0, 5) || "?"}`;
    const who = ctx.members?.find((m) => m.id === e.member_id)?.name || "family";
    return `- ${time}: "${e.title}" (${who}, id: ${e.id})`;
  }).join("\n") || "None";

  // Build this week's meals
  const weekMeals = ctx.meals?.map(
    (m) => `- ${m.date} ${m.meal_type}: "${m.title}"`
  ).join("\n") || "None";

  // Build lists
  const listsStr = ctx.lists?.map((l) => {
    const items = l.items?.map(
      (i) => `  ${i.checked ? "[x]" : "[ ]"} ${i.text} (id: ${i.id})`
    ).join("\n") || "  (empty)";
    return `"${l.name}" (id: ${l.id}):\n${items}`;
  }).join("\n") || "None";

  // Build rewards
  const rewardsStr = ctx.rewards?.map(
    (r) => `- "${r.title}" costs ${r.points_cost}pts (id: ${r.id})`
  ).join("\n") || "None";

  // Build notes
  const notesStr = ctx.notes?.map((n) => {
    const who = ctx.members?.find((m) => m.id === n.member_id)?.name || "family";
    return `- "${n.text}" by ${who}${n.pinned ? " (pinned)" : ""} (id: ${n.id})`;
  }).join("\n") || "None";

  // Build family messages
  const messagesStr = ctx.messages?.map((m) => {
    const from = ctx.members?.find((mem) => mem.id === m.from_member_id)?.name || "someone";
    const to = m.to_member_id ? (ctx.members?.find((mem) => mem.id === m.to_member_id)?.name || "someone") : "everyone";
    const flags = [m.pinned ? "pinned" : "", m.urgent ? "URGENT" : ""].filter(Boolean).join(", ");
    return `- "${m.content}" from ${from} to ${to}${flags ? ` (${flags})` : ""} (id: ${m.id})`;
  }).join("\n") || "None";

  // Build countdowns
  const countdownsStr = ctx.countdowns?.map((c) => {
    const daysLeft = Math.ceil((new Date(c.target_date) - new Date()) / (86400000));
    return `- "${c.title}" on ${c.target_date} (${daysLeft > 0 ? daysLeft + ' days left' : 'today!'})`;
  }).join("\n") || "None";

  // Build timers & alarms
  const timersStr = ctx.activeTimers?.map(t =>
    `- "${t.label}" — ${t.remaining_formatted} remaining (id: ${t.id})`
  ).join("\n") || "None";

  const alarmsStr = ctx.upcomingAlarms?.map(a => {
    const time = new Date(a.alarm_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const rec = a.recurring ? ` (${a.recurring})` : "";
    return `- "${a.title}" at ${time}${rec} (id: ${a.id})`;
  }).join("\n") || "None";

  // Build routines
  const routinesStr = ctx.routines?.map((r) => {
    const who = ctx.members?.find((m) => m.id === r.member_id)?.name || "unassigned";
    const steps = r.steps?.map((s) => {
      const done = s.completions?.some((c) => c.completed_date === today);
      return `  ${done ? "[x]" : "[ ]"} "${s.title}" (${s.points_value || 5}pts, id: ${s.id})`;
    }).join("\n") || "  (no steps)";
    return `"${r.name}" (${r.type}, ${who}, id: ${r.id}):\n${steps}`;
  }).join("\n") || "None";

  // Build today's moods
  const moodsStr = ctx.moodCheckins?.filter((m) => m.checkin_date === today)?.map((m) => {
    const who = ctx.members?.find((mem) => mem.id === m.member_id)?.name || "someone";
    return `- ${who}: ${m.mood}${m.note ? ` ("${m.note}")` : ""}`;
  }).join("\n") || "None checked in";

  // Build active tasks + recently completed
  const activeTasksStr = ctx.activeTasks?.map((t) => {
    const who = ctx.members?.find((m) => m.id === t.assigned_to)?.name || "unassigned";
    const pri = t.priority ? ` [${t.priority}]` : "";
    const time = t.due_time ? ` at ${t.due_time}` : "";
    return `- "${t.title}" assigned to ${who} (${t.points_value || 0}pts, due: ${t.due_date || "anytime"}${time}${pri}, id: ${t.id})`;
  }).join("\n") || "None";

  const recentDoneStr = ctx.recentCompletedTasks?.map((t) => {
    const who = ctx.members?.find((m) => m.id === t.completed_by)?.name || "someone";
    return `- "${t.title}" completed by ${who} on ${t.completed_at} (${t.points_value || 0}pts)`;
  }).join("\n") || "None";

  // ── Layer 1: Base Prompt ──
  const familyName = ctx.familyName || "the family";
  const assistantName = ai_preferences?.assistant_name || "Amara";

  let systemPrompt = `You are ${assistantName}, the ${familyName}'s personal family assistant on their wall-mounted family calendar. You know this family well — their preferences, routines, and members. Act like a trusted family helper, not a generic AI.

TODAY: ${today} (${dayName})
CURRENT PAGE: ${ctx.currentPage || "unknown"}

FAMILY MEMBERS:
${memberList}

ACTIVE TASKS:
${activeTasksStr}

RECENTLY COMPLETED:
${recentDoneStr}

THIS WEEK'S EVENTS:
${weekEvents}

THIS WEEK'S MEALS:
${weekMeals}

LISTS:
${listsStr}

REWARDS AVAILABLE:
${rewardsStr}

NOTES:
${notesStr}

FAMILY MESSAGES:
${messagesStr}

COUNTDOWNS:
${countdownsStr}

ACTIVE TIMERS:
${timersStr}

UPCOMING ALARMS:
${alarmsStr}

ROUTINES:
${routinesStr}

TODAY'S MOODS:
${moodsStr}

PAGE CONTEXT: The user is currently on the "${ctx.currentPage || "unknown"}" page. When they say "add", "remove", or "check" something without specifying where, assume they mean the content relevant to this page:
- "calendar" page → events
- "chores" page → tasks/chores
- "meals" page → meals
- "lists" page → list items (default to Groceries list)
- "rewards" page → rewards
- "routines" page → routines/routine steps
- "family" page → family members

You MUST respond with valid JSON only. No markdown, no code blocks, no extra text.

Response format:
{"reply":"your friendly message","actions":[{"type":"action_type","data":{...}}]}

AVAILABLE ACTIONS:

Events:
- create_event: {title, member_id, start:"YYYY-MM-DDTHH:mm:00", end:"YYYY-MM-DDTHH:mm:00", allDay:false}
- update_event: {event_id, title?, start?, end?, member_id?, allDay?}
- remove_event: {event_id}

Tasks/Chores:
- create_task: {title, assigned_to:member_id, due_date:"YYYY-MM-DD", due_time?"HH:mm", points_value:10, category:"chores|homework|errands|health|cooking|pets|other", priority:"low|medium|high", recurring:false, recurring_pattern?"daily|weekly|monthly"}
- update_task: {task_id, title?, assigned_to?, due_date?, points_value?, category?, priority?}
- complete_task: {task_id, completed_by:member_id}
- remove_task: {task_id}

Meals:
- add_meal: {date:"YYYY-MM-DD", meal_type:"breakfast|lunch|dinner|snack", title, notes?}
- update_meal: {meal_id, title?, meal_type?, notes?}
- remove_meal: {meal_id}

Lists:
- create_list: {name, icon?}
- add_list_items: {list_name, items:["item1","item2"]}
- toggle_list_item: {list_id, item_id}
- remove_list_item: {list_id, item_id}

Notes:
- add_note: {text, member_id?, pinned:false}
- remove_note: {note_id}

Countdowns:
- add_countdown: {title, target_date:"YYYY-MM-DD", icon?, color?}
- remove_countdown: {countdown_id}

Rewards:
- add_reward: {title, description?, points_cost, icon?}
- claim_reward: {reward_id, member_id}

Timers & Alarms:
- set_timer: {label, minutes, icon?:"timer"} — starts a countdown timer
- cancel_timer: {timer_id}
- set_alarm: {title, time:"HH:mm", date?:"YYYY-MM-DD", recurring?:"daily|weekdays|weekends", icon?:"alarm"}
- cancel_alarm: {alarm_id}

Messages:
- send_message: {content, from_member_id, to_member_id?:null_for_all, pinned:false, urgent:false} — post a message on the family message board
- remove_message: {message_id} — remove a message from the board

Routines:
- create_routine: {name, member_id, type:"morning|afternoon|bedtime|custom", steps:[{title, icon?, duration_minutes?, points_value?}]}
- complete_routine_step: {routine_step_id, member_id}

Mood:
- mood_checkin: {member_id, mood:"happy|good|okay|tired|stressed|sad|angry|excited", note?}

Allowance:
- add_allowance: {member_id, amount, type:"bonus|deduction", description} — add bonus money or deduct from a member's allowance
- set_allowance_rate: {member_id, rate} — set allowance rate ($ per 100 points) for a member

Achievements:
- check_achievements: {member_id} — forces a re-check of achievements for a member

Preferences:
- update_preferences: {cuisine_preferences?, dietary_restrictions?, servings?, cooking_speed?, meal_instructions?} — update the family's meal/AI preferences. Use when they mention cuisine ("we like Indian food"), dietary needs ("we're vegetarian"), or cooking preferences. Values are strings or comma-separated lists.

Memory:
- save_memory: {content:"fact to remember", category:"preference|routine|rule|context"} — save something the family told you to remember. Use when they say "remember that...", mention a preference, allergy, routine, or important fact you should know for future conversations.
- forget_memory: {memory_id} — forget a previously saved memory when asked

Info (no mutation, just answer):
- info: {} — use when the user asks a question that doesn't need data changes. Put the answer in "reply".

RULES:
1. Match member names to IDs (case-insensitive). Use their names naturally in responses.
2. NEVER ask for information you already have. You know this family's preferences, dietary restrictions, cuisine choices, and member details. USE THEM. If the user says "plan meals" — you already know what kind of food they like. Just do it.
3. Only ask clarifying questions when genuinely needed (e.g., "which day?" when multiple are possible). Do NOT ask about preferences, dietary restrictions, or cuisine — that information is in the PREFERENCES section above.
4. For dates: "tomorrow" = today+1, "next Monday" = actual date, "Friday" = upcoming Friday. Always output YYYY-MM-DD.
5. For times: "2pm" = "14:00", "morning" = "09:00". Use 24h format HH:mm for start/end times.
6. When updating/deleting, find the item by name in the data above and use its ID.
7. Multiple actions OK (e.g., "add eggs, milk, bread to groceries" = one add_list_items).
8. Be warm, concise, family-friendly. Address members by name. Personalize responses — you know this family.
9. For queries ("how many points?", "what's for dinner?"), use reply text + info action with no data changes.
10. When assigning chores to children, consider their ages. Younger children get simpler tasks.
11. PROACTIVELY SAVE MEMORIES — you are the family's long-term memory. Save ANY fact that could be useful later:
  - Health: allergies, medications, doctor preferences, dietary needs
  - Preferences: favorite foods, colors, activities, shows, restaurants
  - Routines: "every Monday we...", bedtimes, school schedules, work hours
  - Rules: screen time limits, allowance amounts, house rules
  - People: friends' names, teachers, coaches, neighbors, relatives
  - Important facts: shoe sizes, clothing sizes, birthdays, anniversaries
  - Dislikes: "Aarish hates broccoli", "Mom doesn't like spicy food"
  - Context: pet names, car info, home details, school names
  Include a save_memory action alongside your reply. NEVER ask "should I remember this?" — just save it. Use descriptive categories: "health", "preference", "routine", "rule", "people", "context".
  If the user explicitly says "remember that..." — ALWAYS save it, no exceptions.
12. When the family mentions food-related preferences (cuisine type, dietary restrictions, allergies, cooking preferences), ALWAYS include BOTH a save_memory action AND an update_preferences action. For example: "we like Indian food" → save_memory + update_preferences with cuisine_preferences:"Indian".

CRITICAL — YOU MUST FOLLOW THESE:
1. Your ENTIRE response must be valid JSON: {"reply":"...","actions":[...]}
2. NEVER describe an action in your reply text without ALSO including it in the actions array.
3. If you say "I've added X" or "I'm planning X", there MUST be corresponding actions.
4. For meal planning: include an add_meal action for EACH meal you plan. Do not just list them in text.
5. For bulk operations (many meals, many list items), you may use multiple actions. There is no limit on the number of actions.
6. Keep your reply text SHORT (2-3 sentences summary). Put the details in the actions.
7. NEVER respond with plain text. ALWAYS respond with JSON.`;

  // ── Layer 2: Family Preferences (ALWAYS USE THESE — never ask for them) ──
  if (ai_preferences) {
    const toList = (v) => (Array.isArray(v) ? v.join(", ") : v || "");
    const prefLines = [];
    if (ai_preferences.cuisine_preferences) prefLines.push(`Cuisine: ${toList(ai_preferences.cuisine_preferences)}`);
    if (ai_preferences.dietary_restrictions) prefLines.push(`Dietary restrictions: ${toList(ai_preferences.dietary_restrictions)}`);
    if (ai_preferences.servings) prefLines.push(`Default servings: ${ai_preferences.servings} people`);
    if (ai_preferences.cooking_speed) prefLines.push(`Cooking preference: ${ai_preferences.cooking_speed === "quick" ? "Quick meals (30 min or less)" : "Mix of quick and elaborate"}`);
    if (ai_preferences.personality) prefLines.push(`Assistant personality: ${ai_preferences.personality}`);
    if (ai_preferences.tone) prefLines.push(`Tone: ${ai_preferences.tone}`);
    if (ai_preferences.custom_instructions) prefLines.push(`Special instructions: ${ai_preferences.custom_instructions}`);

    if (prefLines.length > 0) {
      systemPrompt += `\n\n── THIS FAMILY'S PREFERENCES (you already know these — NEVER ask for them) ──\n${prefLines.join("\n")}`;
      systemPrompt += `\n\nIMPORTANT: These preferences are ALREADY SET by the family. When they ask you to plan meals, create tasks, or do anything — use these preferences automatically. Do NOT ask "what cuisine?", "any dietary restrictions?", or "how many servings?" — you already know. Just act on the request immediately using these preferences.`;
    }
  }

  // Meal planning behavior
  const mealInstructions = ai_preferences?.meal_instructions ? `\n- Family's specific meal instructions: "${ai_preferences.meal_instructions}"` : "";
  systemPrompt += `\n\nMEAL PLANNING BEHAVIOR:
- When asked to "plan meals" or "plan this week's meals" WITHOUT specifying a meal type: plan ALL four meal types (breakfast, lunch, dinner, snack) for each day. Default to 7 days (rest of the current week through Sunday).
- When a specific meal type is mentioned (e.g., "plan dinners"): only plan that type.
- ALWAYS create add_meal actions immediately using the family's preferences. Do NOT ask what they want.
- When user mentions ingredients: suggest 3 meals matching preferences, list missing ingredients, ask which one, then create add_meal + add_list_items actions.
- NEVER repeat the same dish across the week. Every meal must be unique — no duplicates like "Chicken Biryani" appearing on two different days.
- Include variety: mix different dishes, cooking styles, and proteins across the week. Alternate between rice, roti, naan, dosa, chapathi, parotta as accompaniments.
- Make kid-friendly options for younger children (milder spice, familiar foods).
- For snacks: include healthy options appropriate for the family and children's ages.
- After adding meals, offer to add grocery items for the ingredients needed.
- After planning meals, ALWAYS offer to generate a grocery list. If the user accepts, extract all ingredients from the planned meals and add them to the Groceries list using add_list_items action.
- When asked to "generate grocery list from meals" or similar, collect all meals for the current week and create a comprehensive grocery list with all needed ingredients.${mealInstructions}`;

  // ── Layer 3: Memories ──
  if (memories && Array.isArray(memories) && memories.length > 0) {
    const memoryLines = memories
      .filter(m => m.active)
      .slice(0, 50) // Limit to most recent 50
      .map(m => `- ${m.content}`)
      .join("\n");
    if (memoryLines) {
      systemPrompt += `\n\n── YOU REMEMBER ──\n${memoryLines}`;
    }
  }

  try {
    let text;

    // Use Nova API if NOVA_API_KEY is set, otherwise fallback to Claude
    if (process.env.NOVA_API_KEY) {
      const novaRes = await fetch("https://api.nova.amazon.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.NOVA_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nova-2-lite-v1",
          messages: [
            { role: "system", content: systemPrompt },
            ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 16384,
          temperature: 0.7,
        }),
      });

      if (!novaRes.ok) {
        const err = await novaRes.json().catch(() => ({}));
        console.error("[ai] Nova API error:", err);
        throw new Error(err.error?.message || "Nova API request failed");
      }

      const novaResult = await novaRes.json();
      text = (novaResult.choices?.[0]?.message?.content || "").trim();
    } else {
      const result = await generateText({
        model: gateway("anthropic/claude-haiku-4-5"),
        system: systemPrompt,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        maxTokens: 16384,
      });
      text = (result.text || "").trim();
    }

    let parsed;
    try {
      // Strip markdown code blocks if present
      const clean = text.replace(/^```(?:json)?\n?/gm, "").replace(/\n?```$/gm, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // JSON parse failed (likely truncated response) — try to extract reply text
      const replyMatch = text.match(/"reply"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"actions|"\s*})/);
      if (replyMatch) {
        // Unescape JSON string escapes
        const extracted = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        parsed = { reply: extracted, actions: [] };
      } else {
        // Last resort: strip JSON wrapper if present, use raw text
        const stripped = text.replace(/^\s*\{\s*"reply"\s*:\s*"?/, "").replace(/"?\s*[,}]\s*$/, "");
        parsed = { reply: stripped || text, actions: [] };
      }
    }

    // ── Persist conversation to Supabase ──
    let finalConversationId = conversation_id;

    if (ctx.familyId) {
      try {
        if (conversation_id) {
          // Append to existing conversation
          const userMessage = chatMessages[chatMessages.length - 1];

          // Insert user message
          await supabaseAdmin.from("conversation_messages").insert({
            conversation_id,
            role: "user",
            content: userMessage.content,
          });

          // Insert assistant response
          await supabaseAdmin.from("conversation_messages").insert({
            conversation_id,
            role: "assistant",
            content: parsed.reply || text,
            actions: parsed.actions || [],
          });

          // Update conversation metadata — get current count first, then update
          const { data: convData } = await supabaseAdmin
            .from("conversations")
            .select("message_count")
            .eq("id", conversation_id)
            .single();
          const newCount = (convData?.message_count || 0) + 2;
          await supabaseAdmin
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              message_count: newCount,
            })
            .eq("id", conversation_id);
        } else {
          // Create new conversation
          const userMessage = chatMessages[chatMessages.length - 1];
          const title = userMessage.content.slice(0, 50) + (userMessage.content.length > 50 ? "..." : "");

          const { data: conv, error: convError } = await supabaseAdmin
            .from("conversations")
            .insert({
              family_id: ctx.familyId,
              title,
              message_count: 2,
            })
            .select()
            .single();

          if (convError) throw convError;
          finalConversationId = conv.id;

          // Insert messages
          await supabaseAdmin.from("conversation_messages").insert([
            {
              conversation_id: conv.id,
              role: "user",
              content: userMessage.content,
            },
            {
              conversation_id: conv.id,
              role: "assistant",
              content: parsed.reply || text,
              actions: parsed.actions || [],
            },
          ]);
        }
      } catch (dbErr) {
        console.error("[ai] Supabase persistence error:", dbErr.message);
        // Continue without blocking — conversation persistence is non-critical
      }
    }

    return c.json({
      reply: parsed.reply || text,
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      conversation_id: finalConversationId,
    });
  } catch (err) {
    console.error("[ai] Error:", err.message, err.cause || "");

    if (err.message?.includes("API key") || err.message?.includes("Unauthorized") || err.message?.includes("401")) {
      return c.json({
        reply: "AI is not configured yet. Please set AI_GATEWAY_API_KEY in your Vercel project settings.",
        actions: [],
        error: "missing_api_key",
      }, 500);
    }

    return c.json({
      reply: "Sorry, I had trouble processing that. Please try again.",
      actions: [],
      error: err.message,
    }, 500);
  }
});
