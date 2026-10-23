// Suggested topics for the teacher's daily prompt. Day N suggests topic N
// (cycling round once the list ends). Each prompt is an English meaning; the
// teacher fills in how the family says it and records it.
// Edit freely — this is just a starting point.

export const TOPICS = [
  { title: 'Hello and goodbye', prompts: ['Hello / greeting', 'How are you?', 'I am fine', 'Come (welcome in)', 'Sit down', 'I am going (goodbye)', 'Come again'] },
  { title: 'Family', prompts: ['Mother', 'Father', 'Elder brother', 'Elder sister', 'Younger brother', 'Younger sister', 'Grandmother', 'Grandfather'] },
  { title: 'Yes, no and little words', prompts: ['Yes', 'No', 'OK / alright', 'What?', 'Why?', 'Where?', 'When?', 'Who?'] },
  { title: 'Food', prompts: ['Rice', 'Water', 'Milk', 'Coffee', 'Food / meal', 'Did you eat?', 'I am hungry', 'It is tasty'] },
  { title: 'Numbers 1–10', prompts: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'] },
  { title: 'Around the house', prompts: ['House', 'Door', 'Kitchen', 'Bed / sleep', 'Light', 'Chair', 'Key'] },
  { title: 'Everyday verbs', prompts: ['Eat', 'Drink', 'Go', 'Come', 'Give', 'Take', 'See / look', 'Say / tell'] },
  { title: 'Feelings', prompts: ['Happy', 'Sad', 'Angry', 'Tired', 'Scared', 'I like it', "I don't like it"] },
  { title: 'Time', prompts: ['Today', 'Tomorrow', 'Yesterday', 'Now', 'Later', 'Morning', 'Night'] },
  { title: 'Body', prompts: ['Head', 'Eye', 'Hand', 'Leg', 'Mouth', 'Stomach', 'It hurts'] },
  { title: 'Polite phrases', prompts: ['Please', 'Thank you', 'Sorry', 'Wait a minute', 'No problem', 'Tell me slowly'] },
  { title: 'Questions you hear at home', prompts: ['What is your name?', 'Where are you going?', 'What are you doing?', 'Did you sleep well?', 'When will you come?', 'How much?'] },
  { title: 'Family slang', prompts: ['A word only our family uses', 'How we tease someone', 'What we say when surprised', 'What we say when annoyed', 'A blessing elders say'] },
  { title: 'Short conversation', prompts: ['Line 1 of a short chat', 'Line 2', 'Line 3', 'Line 4', 'Line 5'] },
];

export const topicForDay = (day) => TOPICS[(day - 1) % TOPICS.length];
