import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
import { AuthController, AuthService } from './auth';
import { CareController, CareService, CareSummariesController, ClinicalController, ClinicalService } from './clinical';
import { CommunicationsController, CommunicationsService } from './communications';
import { FollowUpsController, FollowUpsService } from './followups';
import { HealthController } from './health';
import { MediaController, MediaService } from './media';
import { RecordsController, RecordsService } from './records';
import { RemindersController, RemindersService } from './reminders';
import { TasksController, TasksService } from './tasks';
import { SmsDeliveryService } from './sms-delivery';
import { AdminBootstrapService, AdminController, AdminService } from './admin';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({})],
  controllers: [
    HealthController,
    AuthController,
    ClinicalController,
    CareSummariesController,
    CareController,
    RecordsController,
    TasksController,
    FollowUpsController,
    CommunicationsController,
    MediaController,
    RemindersController,
    AdminController,
  ],
  providers: [
    PrismaService,
    SmsDeliveryService,
    AuthService,
    ClinicalService,
    CareService,
    RecordsService,
    TasksService,
    FollowUpsService,
    CommunicationsService,
    MediaService,
    RemindersService,
    AdminService,
    AdminBootstrapService,
  ],
})
export class AppModule {}
