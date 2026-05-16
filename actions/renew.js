// ================= RENEW =================

bot.action('renew', async (ctx) => {
  await ctx.answerCbQuery();

  const students = await getStudents();

  const buttons = [];

  for (let i = 0; i < students.length; i += 2) {

    const row = [];

    const s1 = students[i];

    row.push(
      Markup.button.callback(
        `${s1.name} (${s1.remaining})`,
        `renew_student_${s1.row}`
      )
    );

    if (students[i + 1]) {

      const s2 = students[i + 1];

      row.push(
        Markup.button.callback(
          `${s2.name} (${s2.remaining})`,
          `renew_student_${s2.row}`
        )
      );
    }

    buttons.push(row);
  }

  buttons.push([
    Markup.button.callback(
      '⬅️ Назад',
      'menu'
    )
  ]);

  await safeEdit(
    ctx,
    '🔄 Кого продлить?',
    Markup.inlineKeyboard(buttons)
  );
});

// ================= SELECT PACK =================

bot.action(
  /^renew_student_(\d+)$/,
  async (ctx) => {

    await ctx.answerCbQuery();

    const row = Number(
      ctx.match[1]
    );

    const students =
      await getStudents();

    const student =
      students.find(
        s => s.row === row
      );

    if (!student) {
      return ctx.reply(
        'Ученица не найдена'
      );
    }

    await safeEdit(
      ctx,
      `🔄 Продлить абонемент\n\n👤 ${student.name}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            '4 занятия',
            `renew_pack_${row}_4`
          ),
          Markup.button.callback(
            '8 занятий',
            `renew_pack_${row}_8`
          )
        ],
        [
          Markup.button.callback(
            '⬅️ Назад',
            'renew'
          )
        ]
      ])
    );
  }
);

// ================= CONFIRM RENEW =================

bot.action(
  /^renew_pack_(\d+)_(\d+)$/,
  async (ctx) => {

    await ctx.answerCbQuery();

    const row = Number(
      ctx.match[1]
    );

    const pack = Number(
      ctx.match[2]
    );

    const students =
      await getStudents();

    const student =
      students.find(
        s => s.row === row
      );

    if (!student) {
      return ctx.reply(
        'Ученица не найдена'
      );
    }

    const now = new Date();

    const day = String(
      now.getDate()
    ).padStart(2, '0');

    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const startDate =
      `${day}.${month}`;

    const until = new Date();

    if (pack === 4) {
      until.setDate(
        until.getDate() + 30
      );
    } else {
      until.setDate(
        until.getDate() + 60
      );
    }

    const untilDay = String(
      until.getDate()
    ).padStart(2, '0');

    const untilMonth = String(
      until.getMonth() + 1
    ).padStart(2, '0');

    const untilDate =
      `${untilDay}.${untilMonth}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range:
        `${SHEET_NAME}!B${row}:F${row}`,
      valueInputOption:
        'USER_ENTERED',
      requestBody: {
        values: [[
          pack,
          startDate,
          untilDate,
          0,
          pack
        ]]
      }
    });

    await safeEdit(
      ctx,
      `✅ Абонемент продлен

👤 ${student.name}
📦 ${pack} занятий`,
      mainMenu()
    );
  }
);
