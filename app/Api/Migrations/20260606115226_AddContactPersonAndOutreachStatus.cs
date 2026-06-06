using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Api.Migrations
{
    /// <inheritdoc />
    public partial class AddContactPersonAndOutreachStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastContactedAt",
                table: "Contacts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OutreachStatus",
                table: "Contacts",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "PersonId",
                table: "Contacts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Contacts_PersonId",
                table: "Contacts",
                column: "PersonId");

            migrationBuilder.AddForeignKey(
                name: "FK_Contacts_Persons_PersonId",
                table: "Contacts",
                column: "PersonId",
                principalTable: "Persons",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Contacts_Persons_PersonId",
                table: "Contacts");

            migrationBuilder.DropIndex(
                name: "IX_Contacts_PersonId",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "LastContactedAt",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "OutreachStatus",
                table: "Contacts");

            migrationBuilder.DropColumn(
                name: "PersonId",
                table: "Contacts");
        }
    }
}
